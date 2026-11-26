import { beforeAll, describe, expect, test } from 'vitest'
import { sql } from '@hub/db'
import { addMember, createCompany, createTestApi, type Person, type TestCompany } from './support/test-api'

/*
  SEDG disclosure reports: who may see and edit them, the figures calculated
  from VERIFIED entries (and the baseline year for reductions), saving
  (validation, merging, removing), and the edit history.
  Rules: AGENTS.md "SEDG disclosure" and @hub/shared/sedg.
*/

const api = createTestApi()

type Source = { id: string; name: string; category: string }

let company: TestCompany
let admin: Person
let manager: Person
let member: Person
const sources: Record<'diesel' | 'electricity' | 'water' | 'landfill' | 'paper', Source> = {} as never

beforeAll(async () => {
  company = await createCompany(api) // manufacturing template: fuels, electricity, water, waste
  admin = company.admin
  manager = await addMember(api, company, 'manager', 'Mia Manager')
  member = await addMember(api, company, 'member', 'Max Member')

  const { body } = await admin.get('/v1/company/sources?year=2025')
  const find = (pattern: RegExp) => {
    const source = body.sources.find((s: Source) => pattern.test(`${s.category} · ${s.name}`))
    if (!source) throw new Error(`No template source like ${pattern}`)
    return source as Source
  }
  sources.diesel = find(/Diesel \(average biofuel blend\)/)
  sources.electricity = find(/Electricity: UK/)
  sources.water = find(/^Water supply/)
  sources.landfill = find(/Commercial and industrial waste · Landfill/)
  sources.paper = find(/Paper and board: mixed · Closed-loop/)
})

/** Adds an entry as the Admin, verifying it unless `pending`; returns its CO2e in kg */
async function addEntry(source: Source, unit: string, amount: number, period: string, { pending = false } = {}) {
  const added = await admin.post('/v1/emissions/entries', { sourceId: source.id, unit, amount, period })
  expect(added.status, JSON.stringify(added.body)).toBe(201)
  if (!pending) expect((await manager.post(`/v1/emissions/entries/${added.body.id}/verify`)).status).toBe(200)
  return Number(added.body.co2eKg)
}

const report = async (person: Person, year: number) => {
  const response = await person.get(`/v1/reports/sedg/${year}`)
  expect(response.status, JSON.stringify(response.body)).toBe(200)
  return response.body
}

describe('who can see SEDG reports', () => {
  test('Admins and Managers can; Members get 403 on every endpoint', async () => {
    expect((await manager.get('/v1/reports/sedg/2025')).status).toBe(200)
    expect((await admin.get('/v1/reports/sedg/2025')).status).toBe(200)
    expect((await member.get('/v1/reports/sedg/2025')).status).toBe(403)
    expect((await member.patch('/v1/reports/sedg/2025', { level: 'advanced' })).status).toBe(403)
    expect((await member.get('/v1/reports/sedg/2025/history')).status).toBe(403)
  })

  test("another company's people only ever see their own company's report", async () => {
    const other = await createCompany(api, { template: false })
    expect((await admin.patch('/v1/reports/sedg/2024', { answers: { gen_headquarters: 'Shah Alam' } })).status).toBe(200)
    const theirs = await report(other.admin, 2024)
    expect(theirs.answers).toEqual({})
    expect(theirs.updatedAt).toBeNull()
  })

  test('a future year is refused', async () => {
    const next = new Date().getFullYear() + 1
    expect((await admin.get(`/v1/reports/sedg/${next}`)).status).toBe(400)
    expect((await admin.patch(`/v1/reports/sedg/${next}`, { level: 'basic' })).status).toBe(400)
  })
})

describe('an empty report', () => {
  test('reads as Basic with no answers, and general information filled in', async () => {
    const empty = await report(admin, 2023)
    expect(empty).toMatchObject({ year: 2023, level: 'basic', answers: {}, updatedAt: null, updatedBy: null })
    expect(empty.automatic.disclosurePeriod.value).toBe('1 January 2023 to 31 December 2023')
    expect(empty.automatic.companyName.value).toMatch(/^Test Company/)
    // No verified entries in 2023: nothing calculated
    expect(empty.automatic.scope1).toBeUndefined()
    expect(empty.years).toContain(new Date().getFullYear())
  })
})

describe('figures from verified entries', () => {
  let dieselKg: number
  let electricityKg: number
  let baselineDieselKg: number
  let baselineElectricityKg: number

  beforeAll(async () => {
    dieselKg = await addEntry(sources.diesel, 'litres', 100, '2025-03')
    await addEntry(sources.diesel, 'litres', 999, '2025-04', { pending: true }) // never counts
    electricityKg = await addEntry(sources.electricity, 'kWh', 1000, '2025-03')
    await addEntry(sources.water, 'cubic metres', 10, '2025-03')
    await addEntry(sources.landfill, 'tonnes', 2, '2025-05')
    await addEntry(sources.paper, 'tonnes', 1, '2025-05')
    // The baseline year: scope 1 and 2 only
    baselineDieselKg = await addEntry(sources.diesel, 'litres', 300, '2022-06')
    baselineElectricityKg = await addEntry(sources.electricity, 'kWh', 1500, '2022-06')
  })

  test('totals count only verified entries, converted to the units SEDG asks for', async () => {
    const { automatic } = await report(admin, 2025)
    expect(automatic.scope1.value).toBeCloseTo(dieselKg / 1000, 3)
    expect(automatic.scope1.note).toBe('From 1 verified entry')
    expect(automatic.scope2.value).toBeCloseTo(electricityKg / 1000, 3)
    expect(automatic.electricity.value).toBe(1000)
    expect(automatic.purchasedWater.value).toBe(10_000) // 10 cubic metres = 10,000 litres
    expect(automatic.wasteGenerated.value).toBe(3)
    expect(automatic.wasteDiverted.value).toBe(1) // closed-loop recycling
    expect(automatic.wasteDisposed.value).toBe(2) // landfill
    expect(automatic.scope3.value).toBeGreaterThan(0) // water + waste are scope 3
    // No baseline year yet: no reductions
    expect(automatic.scope1Reduction).toBeUndefined()
    expect(automatic.electricityReduction).toBeUndefined()
  })

  test('reductions compare with the baseline year, only for scopes the baseline has', async () => {
    expect((await admin.patch('/v1/company/settings', { baselineYear: 2022 })).status).toBe(200)
    const { automatic, baselineYear } = await report(manager, 2025)
    expect(baselineYear).toBe(2022)
    expect(automatic.scope1Reduction.value).toBeCloseTo((baselineDieselKg - dieselKg) / 1000, 3)
    expect(automatic.scope2Reduction.value).toBeCloseTo((baselineElectricityKg - electricityKg) / 1000, 3)
    expect(automatic.scope1Reduction.note).toMatch(/^2022: .* t, 2025: .* t/)
    expect(automatic.electricityReduction.value).toBe(500)
    // 2022 has no scope 3 or water entries: no "reduction" from nothing
    expect(automatic.scope3Reduction).toBeUndefined()
    expect(automatic.waterReduction).toBeUndefined()
  })

  test('a baseline year that is not earlier than the report year gives no reductions', async () => {
    const { automatic } = await report(admin, 2022)
    expect(automatic.scope1.value).toBeCloseTo(baselineDieselKg / 1000, 3)
    expect(automatic.scope1Reduction).toBeUndefined()
  })

  test('the intensity (E1.7) needs the revenue and uses the figures the report shows', async () => {
    expect((await report(admin, 2025)).automatic.intensity).toBeUndefined()
    await admin.patch('/v1/reports/sedg/2025', { answers: { gen_revenue: 2_000_000 } })
    const calculated = await report(admin, 2025)
    const shown = calculated.automatic.scope1.value + calculated.automatic.scope2.value
    expect(calculated.automatic.intensity.value).toBeCloseTo(shown / 2, 3) // per MYR 1 million
    // An entered Scope 1 figure wins over the calculated one, also for the intensity
    await admin.patch('/v1/reports/sedg/2025', { answers: { e1_1: 10 } })
    const entered = await report(admin, 2025)
    expect(entered.answers.e1_1).toBe(10)
    expect(entered.automatic.intensity.value).toBeCloseTo((10 + entered.automatic.scope2.value) / 2, 3)
  })

  test('only Admins set the baseline year, and never in the future', async () => {
    expect((await manager.patch('/v1/company/settings', { baselineYear: 2023 })).status).toBe(403)
    expect((await admin.patch('/v1/company/settings', { baselineYear: new Date().getFullYear() + 1 })).status).toBe(400)
    expect((await admin.patch('/v1/company/settings', { baselineYear: 1800 })).status).toBe(400)
    expect((await admin.get('/v1/company/settings')).body.baselineYear).toBe(2022)
  })
})

describe('saving', () => {
  const year = 2021

  test('values are validated with the same rules as the form', async () => {
    const save = (answers: Record<string, unknown>) => admin.patch(`/v1/reports/sedg/${year}`, { answers })
    expect((await save({ no_such_field: 1 })).body.error.message).toMatch(/Unknown field/)
    expect((await save({ s2_2_turnover: 150 })).body.error.message).toMatch(/0 to 100/)
    expect((await save({ e2_1_electricity: -5 })).status).toBe(400) // not a reduction
    expect((await save({ s4_1_injuries: 1.5 })).status).toBe(400)
    expect((await save({ gen_headquarters: '   ' })).status).toBe(400)
    expect((await admin.patch(`/v1/reports/sedg/${year}`, {})).status).toBe(400)
    expect((await admin.patch(`/v1/reports/sedg/${year}`, { level: 'expert' })).status).toBe(400)
    // A reduction may be negative (emissions went up)
    expect((await save({ e2_2_electricity: -5 })).status).toBe(200)
  })

  test('changes merge: two people saving different fields keep both; null removes a value', async () => {
    await Promise.all([
      admin.patch(`/v1/reports/sedg/${year}`, { answers: { gen_headquarters: '  Shah   Alam ' } }),
      manager.patch(`/v1/reports/sedg/${year}`, { answers: { g1_1: 5, e5_1: 'Steel\nPlastic' } }),
    ])
    let saved = await report(admin, year)
    expect(saved.answers).toMatchObject({ gen_headquarters: 'Shah Alam', g1_1: 5, e5_1: 'Steel\nPlastic', e2_2_electricity: -5 })

    const removed = await manager.patch(`/v1/reports/sedg/${year}`, { answers: { g1_1: null, s4_1_injuries: 0 }, level: 'advanced' })
    expect(removed.body).toMatchObject({ level: 'advanced', updatedBy: { name: 'Mia Manager' } })
    saved = await report(admin, year)
    expect(saved.answers.g1_1).toBeUndefined()
    expect(saved.answers.s4_1_injuries).toBe(0)
    expect(saved.level).toBe('advanced')
    expect(saved.updatedBy.name).toBe('Mia Manager')
    expect(saved.years).toContain(year)
  })
})

describe('history', () => {
  const year = 2020

  test("a person's saves within 15 minutes are one edit; others start their own", async () => {
    await admin.patch(`/v1/reports/sedg/${year}`, { answers: { e2_1_electricity: 100 } })
    await admin.patch(`/v1/reports/sedg/${year}`, { answers: { e3_1_purchased: 5, gen_headquarters: 'Ipoh' } })
    await manager.patch(`/v1/reports/sedg/${year}`, { level: 'intermediate' })

    const { body } = await admin.get(`/v1/reports/sedg/${year}/history`)
    expect(body.items).toHaveLength(2)
    expect(body.items[0]).toMatchObject({ actor: { name: 'Mia Manager' }, changed: ['Level'] })
    expect(body.items[1]).toMatchObject({ actor: { name: 'Ada Admin' }, changed: ['E2.1', 'E3.1', 'General'] })
    expect(new Date(body.items[1].endedAt) >= new Date(body.items[1].startedAt)).toBe(true)
    expect(body.nextCursor).toBeNull()
  })

  test('after 15 minutes a new edit starts', async () => {
    // Pretend the Admin's edit ended 20 minutes ago
    await api.db.execute(sql`
      update sedg_report_edits set ended_at = ended_at - interval '20 minutes'
       where report_id = (select r.id from sedg_reports r where r.year = ${year} and r.organization_id = ${company.id})
         and actor_id = ${admin.id}`)
    await admin.patch(`/v1/reports/sedg/${year}`, { answers: { g3_1: 2024 } })
    const { body } = await admin.get(`/v1/reports/sedg/${year}/history`)
    expect(body.items.map((item: { changed: string[] }) => item.changed)).toEqual([['G3.1'], ['Level'], ['E2.1', 'E3.1', 'General']])
  })

  test('pages of 20, newest first, with a cursor', async () => {
    const [{ id: reportId }] = (
      await api.db.execute<{ id: string }>(sql`select id from sedg_reports where year = ${year} and organization_id = ${company.id}`)
    ).rows
    await api.db.execute(sql`
      insert into sedg_report_edits (report_id, actor_id, started_at, ended_at, changed)
      select ${reportId}, ${manager.id}, now() - make_interval(days => n), now() - make_interval(days => n), array['S2.1']
        from generate_series(1, 25) n`)
    const first = await admin.get(`/v1/reports/sedg/${year}/history`)
    expect(first.body.items).toHaveLength(20)
    const second = await admin.get(`/v1/reports/sedg/${year}/history?cursor=${first.body.nextCursor}`)
    expect(second.body.items).toHaveLength(28 - 20) // 3 real edits + 25 inserted
    expect(second.body.nextCursor).toBeNull()
    const all = [...first.body.items, ...second.body.items].map((item: { endedAt: string }) => item.endedAt)
    expect(all).toEqual([...all].sort().reverse())
    expect((await admin.get(`/v1/reports/sedg/${year}/history?cursor=nonsense`)).status).toBe(400)
  })
})
