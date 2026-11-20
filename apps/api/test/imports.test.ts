import { beforeAll, describe, expect, test } from 'vitest'
import { sql } from '@hub/db'
import { nearlySame } from '../src/emissions/import-check'
import { addMember, createCompany, createTestApi, storedFactor, type Person, type TestCompany } from './support/test-api'

/*
  Spreadsheet imports: the row checks (every problem with its row and column),
  importing in one transaction, the list of imports, and undo.
*/

const api = createTestApi()

type Source = { id: string; name: string; category: string; scope: number }

let company: TestCompany
let admin: Person
let manager: Person
let member: Person
let colleague: Person
let diesel: Source
let dieselLabel: string

/** A row as the app sends it: diesel in litres, June 2025, unless changed */
const row = (number: number, changes: Record<string, unknown> = {}) => ({
  row: number,
  month: '2025-06',
  source: dieselLabel,
  amount: 100,
  unit: 'litres',
  ...changes,
})

/** Checks rows and returns them by row number */
async function check(person: Person, rows: object[]) {
  const response = await person.post('/v1/emissions/imports/check', { rows })
  expect(response.status, JSON.stringify(response.body)).toBe(200)
  return new Map<number, any>(response.body.rows.map((checked: any) => [checked.row, checked]))
}

const problemsOf = (checked: any) => checked.problems.map((problem: any) => `${problem.column}: ${problem.message}`)

async function importRows(person: Person, rows: object[], options: { skipInvalid?: boolean; expectedEntries?: number; fileName?: string } = {}) {
  return person.post('/v1/emissions/imports', {
    fileName: options.fileName ?? 'fuel-2025.xlsx',
    rows,
    skipInvalid: options.skipInvalid ?? false,
    expectedEntries: options.expectedEntries ?? rows.length,
  })
}

beforeAll(async () => {
  company = await createCompany(api)
  admin = company.admin
  manager = await addMember(api, company, 'manager', 'Mia Manager')
  member = await addMember(api, company, 'member', 'Max Member')
  colleague = await addMember(api, company, 'member', 'Cleo Colleague')

  const { body } = await admin.get('/v1/company/sources?year=2025')
  diesel = body.sources.find((s: Source) => s.category === 'Fuels' && /Diesel \(average biofuel blend\)/.test(s.name))
  dieselLabel = `${diesel.category} · ${diesel.name}`
})

describe('checking rows', () => {
  test('valid rows get the factor of their own year and the calculated CO2e', async () => {
    const rows = await check(member, [row(2, { month: '2021-03', amount: '1,200.5' }), row(3, { month: 'Jun 2025', unit: 'L' })])
    const factor2021 = await storedFactor(api, diesel.id, 'litres', 2021)
    expect(rows.get(2)).toMatchObject({
      problems: [],
      entry: { period: '2021-03', amount: 1200.5, unit: 'litres', factorYear: 2021, scope: 1, source: { id: diesel.id } },
    })
    expect(rows.get(2).entry.co2eKg).toBeCloseTo(1200.5 * factor2021!, 6)
    expect(rows.get(3).entry).toMatchObject({ period: '2025-06', unit: 'litres', factorYear: 2025 })
  })

  test('every problem is reported with its row and column, and nothing is saved', async () => {
    const before = await member.get('/v1/emissions/status-counts')
    const rows = await check(member, [
      row(2, { month: '13/2025' }),
      row(3, { month: `${new Date().getUTCFullYear() + 1}-01` }),
      row(4, { amount: '1200,5' }),
      row(5, { amount: '0', unit: 'kg' }), // two problems in one row: both reported
      row(6, { source: 'Diesel van' }),
      row(7, { unit: 'kWh' }),
      row(8, { unit: '' }),
      row(9, { month: '', source: '', amount: '' }),
      row(10, { notes: 'x'.repeat(1001) }),
    ])
    expect(problemsOf(rows.get(2))).toEqual(['month: "13/2025" is not a month. Use a month like 2025-03'])
    expect(problemsOf(rows.get(3))[0]).toMatch(/^month: .* is in the future$/)
    expect(problemsOf(rows.get(4))).toEqual(['amount: "1200,5": use a dot for decimals, e.g. 1200.5'])
    expect(problemsOf(rows.get(5))).toEqual([
      'amount: The amount must be greater than 0',
      expect.stringMatching(/^unit: "kg" is not available for this source/),
    ])
    expect(problemsOf(rows.get(6))[0]).toMatch(/^source: "Diesel van" is not one of your sources/)
    expect(problemsOf(rows.get(7))[0]).toMatch(/^unit: "kWh" is not available for this source\. Use .*kWh \(Gross CV\)/)
    expect(problemsOf(rows.get(8))[0]).toMatch(/^unit: Enter the unit: /)
    expect(rows.get(9).problems.map((p: any) => p.column)).toEqual(['month', 'amount', 'source'])
    expect(problemsOf(rows.get(10))).toEqual(['notes: Keep the notes under 1000 characters'])
    for (const checked of rows.values()) expect(checked.entry).toBeNull()

    expect((await member.get('/v1/emissions/status-counts')).body).toEqual(before.body)
  })

  test('sources match by "Category · Name", by name, or by the last part, never by a guess', async () => {
    const rows = await check(member, [
      row(2, { source: diesel.name }),
      row(3, { source: 'Diesel (average biofuel blend)' }),
      row(4, { source: 'fuels > liquid fuels > DIESEL (average biofuel blend)' }),
      row(5, { source: 'Liquid fuels Diesel average' }), // close, but not exact: suggested, not used
    ])
    for (const number of [2, 3, 4]) expect(rows.get(number).entry?.source.id, `row ${number}`).toBe(diesel.id)
    expect(problemsOf(rows.get(5))[0]).toContain(`Did you mean "${dieselLabel}"?`)
  })

  test('typos get a suggestion ("Did you mean"), never a silent match', async () => {
    expect(nearlySame('disel', 'diesel')).toBe(true)
    expect(nearlySame('dieseel', 'diesel')).toBe(true)
    expect(nearlySame('deisel', 'diesel')).toBe(false) // two letters swapped = two changes
    expect(nearlySame('van', 'vat')).toBe(false) // short words must match exactly
    const rows = await check(member, [row(2, { source: 'Liquid fuels Disel (average biofuel blend)' })])
    expect(rows.get(2).entry).toBeNull()
    expect(problemsOf(rows.get(2))[0]).toContain(`Did you mean "${dieselLabel}"?`)
  })

  test('a row with a wrong month still gets its unit checked', async () => {
    const rows = await check(member, [row(2, { month: '01/03/2025', unit: 'kWh' })])
    expect(rows.get(2).problems.map((p: any) => p.column)).toEqual(['month', 'unit'])
  })

  test('a source in the library that the company does not track, and an ambiguous name', async () => {
    const wtt = await admin.get('/v1/emission-sources?q=butane&scope=3')
    const wttButane = wtt.body.items.find((s: Source) => s.category === 'WTT- fuels' && s.name === 'Gaseous fuels · Butane')
    const fuels = await admin.get('/v1/emission-sources?q=butane&scope=1')
    const butane = fuels.body.items.find((s: Source) => s.name === 'Gaseous fuels · Butane')

    let rows = await check(member, [row(2, { source: 'Fuels · Gaseous fuels · Butane' })])
    expect(problemsOf(rows.get(2))[0]).toMatch(/not one of your company's sources yet\. An Admin or Manager can add it/)

    // Track butane twice (Fuels and WTT- fuels): the bare name is ambiguous, the full label is not
    expect((await admin.post('/v1/company/sources', { sources: [{ sourceId: butane.id }, { sourceId: wttButane.id }] })).status).toBe(200)
    rows = await check(member, [
      row(2, { source: 'Gaseous fuels · Butane' }),
      row(3, { source: 'WTT- fuels · Gaseous fuels · Butane' }),
    ])
    expect(problemsOf(rows.get(2))[0]).toMatch(/matches 2 of your sources\. Write it in full/)
    expect(rows.get(3).entry.source.id).toBe(wttButane.id)
  })

  test('repeated rows and existing entries are warnings, not problems', async () => {
    const existing = await member.post('/v1/emissions/entries', { sourceId: diesel.id, unit: 'litres', amount: 777, period: '2025-02' })
    expect(existing.status).toBe(201)
    const rows = await check(member, [row(2, { amount: 555 }), row(3, { amount: 555 }), row(4, { amount: 777, month: '2025-02' })])
    expect(rows.get(2).warnings).toEqual([])
    expect(rows.get(3).warnings[0].message).toBe('Same source, month, amount and unit as row 2')
    expect(rows.get(4).warnings[0].message).toMatch(/already has an entry/)
    for (const number of [2, 3, 4]) expect(rows.get(number).entry).not.toBeNull()
  })

  test('limits: 1,000 rows at most', async () => {
    const tooMany = Array.from({ length: 1001 }, (_, index) => row(index + 2))
    const response = await member.post('/v1/emissions/imports/check', { rows: tooMany })
    expect(response.status).toBe(400)
    expect(response.body.error.message).toMatch(/Import up to 1000 rows/)

    // Requests far beyond what 1,000 rows can be are refused before they're read
    const huge = await member.post('/v1/emissions/imports/check', { rows: [row(2, { notes: 'x'.repeat(4 * 1024 * 1024) })] })
    expect(huge.status).toBe(413)
    expect(huge.body.error.code).toBe('too_large')
  })
})

describe('importing', () => {
  test('refused while rows have problems, unless the person chose to skip them', async () => {
    const rows = [row(2, { amount: 10 }), row(3, { amount: 'ten' }), row(4, { amount: 30 })]
    const refused = await importRows(member, rows, { expectedEntries: 2 })
    expect(refused.status).toBe(400)
    expect(refused.body.error).toEqual({ code: 'rows_invalid', message: '1 row has problems. Fix them, or choose to skip them.' })

    const imported = await importRows(member, rows, { skipInvalid: true, expectedEntries: 2, fileName: 'skip.xlsx' })
    expect(imported.status, JSON.stringify(imported.body)).toBe(201)
    expect(imported.body).toMatchObject({
      fileName: 'skip.xlsx',
      entryCount: 2,
      skippedRows: 1,
      remainingEntries: 2,
      createdBy: { id: member.id, name: 'Max Member' },
      undoneAt: null,
    })
  })

  test('if the check changed since the preview, nothing is saved', async () => {
    const response = await importRows(member, [row(2), row(3, { amount: -1 })], { skipInvalid: true, expectedEntries: 2 })
    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('check_changed')
  })

  test('imported entries are ordinary Pending entries, listed per import, with the file and row in their history', async () => {
    const imported = await importRows(member, [row(5, { amount: 11, notes: 'Bowser A' }), row(6, { amount: 12, dataSource: 'Invoice 7' })])
    expect(imported.status).toBe(201)
    const list = await member.get(`/v1/emissions/entries?importId=${imported.body.id}`)
    expect(list.body.total).toBe(2)
    expect(list.body.items.map((e: any) => [e.amount, e.status, e.dataSource])).toEqual(
      expect.arrayContaining([
        [11, 'pending', null],
        [12, 'pending', 'Invoice 7'],
      ]),
    )
    const counts = await member.get(`/v1/emissions/status-counts?importId=${imported.body.id}`)
    expect(counts.body).toEqual({ pending: 2, verified: 0, rejected: 0 })

    const first = list.body.items.find((e: any) => e.amount === 11)
    const detail = await member.get(`/v1/emissions/entries/${first.id}`)
    expect(detail.body.notes).toBe('Bowser A')
    expect(detail.body.events[0]).toMatchObject({
      action: 'created',
      actor: { id: member.id },
      details: { import: { id: imported.body.id, fileName: 'fuel-2025.xlsx', row: 5 } },
    })
  })

  test('with automatic verification, imported entries are verified straight away', async () => {
    const auto = await createCompany(api, { template: true })
    expect((await auto.admin.patch('/v1/company/settings', { requireVerification: false })).status).toBe(200)
    const imported = await importRows(auto.admin, [row(2)])
    expect(imported.status).toBe(201)
    const list = await auto.admin.get(`/v1/emissions/entries?importId=${imported.body.id}`)
    expect(list.body.items[0].status).toBe('verified')
  })

  test('1,000 rows go in at once (one transaction, multi-row inserts)', async () => {
    const rows = Array.from({ length: 1000 }, (_, index) => row(index + 2, { amount: 1000 + index, month: `2024-${String((index % 12) + 1).padStart(2, '0')}` }))
    const started = performance.now()
    const imported = await importRows(admin, rows, { fileName: 'big.xlsx' })
    const took = performance.now() - started
    expect(imported.status, JSON.stringify(imported.body)).toBe(201)
    expect(imported.body.entryCount).toBe(1000)
    const { rows: stored } = await api.db.execute<{ entries: number; events: number }>(sql`
      select (select count(*)::int from emission_entries where import_id = ${imported.body.id}) as entries,
             (select count(*)::int from emission_entry_events where details -> 'import' ->> 'id' = ${imported.body.id}) as events`)
    expect(stored[0]).toEqual({ entries: 1000, events: 1000 })
    expect(took).toBeLessThan(5000)
  })

  test('Members, Managers and Admins can import; other companies see nothing of it', async () => {
    const imported = await importRows(colleague, [row(2, { amount: 3 })])
    expect(imported.status).toBe(201)
    const outsider = await createCompany(api)
    expect((await outsider.admin.get(`/v1/emissions/imports/${imported.body.id}`)).status).toBe(404)
    expect((await outsider.admin.post(`/v1/emissions/imports/${imported.body.id}/undo`)).status).toBe(404)
    expect((await outsider.admin.get(`/v1/emissions/entries?importId=${imported.body.id}`)).body.total).toBe(0)
    expect((await outsider.admin.get('/v1/emissions/imports')).body.items).toEqual([])
    // Checks use their own source list (the same template here, so diesel is known)
    expect((await outsider.admin.post('/v1/emissions/imports/check', { rows: [row(2)] })).body.rows[0].problems).toEqual([])
  })
})

describe('the list of imports', () => {
  test('keyset pages, newest first, every import once', async () => {
    const all: string[] = []
    let cursor: string | null = null
    do {
      const page: any = await member.get(`/v1/emissions/imports?limit=2${cursor ? `&cursor=${cursor}` : ''}`)
      expect(page.status).toBe(200)
      expect(page.body.items.length).toBeLessThanOrEqual(2)
      all.push(...page.body.items.map((item: any) => item.createdAt))
      cursor = page.body.nextCursor
    } while (cursor)
    const { rows: stored } = await api.db.execute<{ count: number }>(
      sql`select count(*)::int as count from emission_imports where organization_id = ${company.id}`,
    )
    expect(stored[0].count).toBeGreaterThan(2) // more than one page
    expect(all.length).toBe(stored[0].count)
    expect([...all].sort().reverse()).toEqual(all)
    expect((await member.get('/v1/emissions/imports?cursor=nonsense')).status).toBe(400)
  })
})

describe('undo', () => {
  test('the importer can undo; another Member cannot; every deleted entry stays in the audit trail', async () => {
    const imported = await importRows(member, [row(2, { amount: 21 }), row(3, { amount: 22 })], { fileName: 'oops.xlsx' })
    const id = imported.body.id
    expect((await colleague.post(`/v1/emissions/imports/${id}/undo`)).status).toBe(403)

    const undone = await member.post(`/v1/emissions/imports/${id}/undo`)
    expect(undone.status, JSON.stringify(undone.body)).toBe(200)
    expect(undone.body).toMatchObject({ remainingEntries: 0, undoneBy: { id: member.id }, entryCount: 2 })
    expect(undone.body.undoneAt).not.toBeNull()
    expect((await member.get(`/v1/emissions/entries?importId=${id}`)).body.total).toBe(0)

    const { rows: events } = await api.db.execute<{ count: number }>(sql`
      select count(*)::int as count from emission_entry_events
       where action = 'deleted' and details -> 'undoneImport' ->> 'id' = ${id}`)
    expect(events[0].count).toBe(2)

    const again = await member.post(`/v1/emissions/imports/${id}/undo`)
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('already_undone')
  })

  test('Managers can undo anyone’s import', async () => {
    const imported = await importRows(colleague, [row(2, { amount: 31 })])
    expect((await manager.post(`/v1/emissions/imports/${imported.body.id}/undo`)).status).toBe(200)
  })

  test('not once a person verified one of its entries (until it is reopened)', async () => {
    const imported = await importRows(member, [row(2, { amount: 41 }), row(3, { amount: 42 })])
    const id = imported.body.id
    const list = await member.get(`/v1/emissions/entries?importId=${id}`)
    const entry = list.body.items[0]
    expect((await manager.post(`/v1/emissions/entries/${entry.id}/verify`)).status).toBe(200)

    const blocked = await admin.post(`/v1/emissions/imports/${id}/undo`)
    expect(blocked.status).toBe(409)
    expect(blocked.body.error).toEqual({
      code: 'entries_verified',
      message: '1 entry was verified since the import. Reopen them first to undo it.',
    })
    expect((await admin.get(`/v1/emissions/imports/${id}`)).body).toMatchObject({ verifiedByPerson: 1, remainingEntries: 2 })

    expect((await manager.post(`/v1/emissions/entries/${entry.id}/reopen`)).status).toBe(200)
    expect((await admin.post(`/v1/emissions/imports/${id}/undo`)).status).toBe(200)
  })

  test('entries verified automatically (company setting) do not block undo', async () => {
    const auto = await createCompany(api)
    expect((await auto.admin.patch('/v1/company/settings', { requireVerification: false })).status).toBe(200)
    const imported = await importRows(auto.admin, [row(2)])
    expect((await auto.admin.get(`/v1/emissions/imports/${imported.body.id}`)).body.verifiedByPerson).toBe(0)
    expect((await auto.admin.post(`/v1/emissions/imports/${imported.body.id}/undo`)).status).toBe(200)
  })
})
