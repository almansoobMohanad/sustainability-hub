import { beforeAll, describe, expect, test } from 'vitest'
import { SECTORS } from '@hub/shared/sectors'
import { resolveSectorTemplates } from '../src/factors/sector-templates'
import { createTestApi, Person, signUp, storedFactor, uniqueEmail } from './support/test-api'

/*
  The UK factor library: search, filters, keyset pages, the year fallback and
  the sector templates. The "large data" rules in AGENTS.md: everything paged
  and filtered in the database, never the whole library in one response.
*/

const api = createTestApi()
let person: Person

beforeAll(async () => {
  person = await signUp(api, 'Finn Factors')
})

type Page = { year: number; items: { id: string; scope: number; category: string; name: string; factors: { unit: string; kgCo2ePerUnit: number; year: number }[] }[]; nextCursor: string | null; total: number | null }

/** Follows nextCursor to the end and returns every item (and the pages' totals). */
async function walk(query: string) {
  const items: Page['items'] = []
  const totals: (number | null)[] = []
  let cursor: string | null = null
  do {
    const response: { status: number; body: Page } = await person.get<Page>(`/v1/emission-sources?${query}${cursor ? `&cursor=${cursor}` : ''}`)
    expect(response.status).toBe(200)
    items.push(...response.body.items)
    totals.push(response.body.total)
    cursor = response.body.nextCursor
  } while (cursor)
  return { items, totals }
}

test('the library covers the UK years 2019 to 2026', async () => {
  const { body } = await person.get('/v1/factor-library')
  expect(body.licence).toMatch(/Open Government Licence/)
  expect(body.years.map((y: { year: number }) => y.year)).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026])
})

test('the library is only for signed-in people', async () => {
  expect((await new Person(api, uniqueEmail(), 'Anonymous').get('/v1/emission-sources')).status).toBe(401)
})

describe('search and pages', () => {
  test('keyset pages cover every match exactly once, in order', async () => {
    const { items, totals } = await walk('scope=1&category=Fuels&limit=7')
    expect(totals[0]).toBe(items.length) // the total, on the first page
    expect(totals.slice(1).every((total) => total === null)).toBe(true) // ...and only there
    expect(totals.length).toBeGreaterThan(1)
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length)
    expect(items.every((item) => item.scope === 1 && item.category === 'Fuels')).toBe(true)
  })

  test('pages are at most 50 items', async () => {
    const tooMany = await person.get('/v1/emission-sources?limit=51')
    expect(tooMany.status).toBe(400)
    expect(tooMany.body.error.code).toBe('invalid_request')
    expect((await person.get('/v1/emission-sources')).body.items).toHaveLength(30) // default page
  })

  test('every word must match (in the category or the name)', async () => {
    const { items } = await walk('q=diesel%20van&limit=50')
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      const text = `${item.category} ${item.name}`.toLowerCase()
      expect(text).toContain('diesel')
      expect(text).toContain('van')
    }
  })

  test('a bad cursor is refused', async () => {
    expect((await person.get('/v1/emission-sources?cursor=abc')).status).toBe(400)
  })

  test('categories come with counts', async () => {
    const { body } = await person.get('/v1/emission-sources/categories?scope=1')
    const fuels = body.categories.find((c: { category: string }) => c.category === 'Fuels')
    const { body: page } = await person.get('/v1/emission-sources?scope=1&category=Fuels&limit=1')
    expect(fuels.count).toBe(page.total)
  })
})

describe('factor years', () => {
  async function dieselLitres(year: number) {
    const { body } = await person.get<Page>(`/v1/emission-sources?q=diesel%20average%20biofuel&scope=1&limit=1&year=${year}`)
    const source = body.items[0]
    return { source, factor: source.factors.find((f) => f.unit === 'litres')! }
  }

  test("each year uses that year's published factor", async () => {
    for (const year of [2019, 2021, 2025]) {
      const { source, factor } = await dieselLitres(year)
      expect(factor.year).toBe(year)
      expect(factor.kgCo2ePerUnit).toBe(await storedFactor(api, source.id, 'litres', year))
    }
  })

  test('a year that is not published yet uses the latest earlier year', async () => {
    const { factor } = await dieselLitres(2030)
    expect(factor.year).toBe(2026)
  })

  test('a year before the library uses its earliest year', async () => {
    const { factor } = await dieselLitres(2010)
    expect(factor.year).toBe(2019)
  })
})

describe('sector templates', () => {
  test('every template key exists in the library', async () => {
    const { missingKeys } = await resolveSectorTemplates(api.db)
    expect(missingKeys).toEqual([])
  })

  test.each(SECTORS.filter((sector) => sector !== 'other'))('%s: sources with a usable default unit', async (sector) => {
    const { body } = await person.get(`/v1/sector-templates/${sector}`)
    expect(body.sources.length).toBeGreaterThan(0)
    const ids = body.sources.map((s: { id: string }) => s.id)
    // Every default unit has a factor this year
    const factors = await Promise.all(
      body.sources.map((s: { id: string; defaultUnit: string }) => storedFactor(api, s.id, s.defaultUnit, 2026)),
    )
    expect(factors.every((value) => value !== null)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('an unknown sector is refused', async () => {
    expect((await person.get('/v1/sector-templates/space-mining')).status).toBe(400)
  })
})
