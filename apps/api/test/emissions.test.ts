import { beforeAll, describe, expect, test } from 'vitest'
import { sql } from '@hub/db'
import { addMember, createCompany, createTestApi, storedFactor, type Person, type TestCompany } from './support/test-api'

/*
  Emission entries: the server-side calculation, the verification workflow,
  the audit trail, pages and filters, and the dashboard summary.
  The rules come from @hub/shared/emissions (entryActions) and the decisions in
  AGENTS.md ("Emissions decisions").
*/

const api = createTestApi()

type Source = { id: string; name: string; category: string; scope: number; defaultUnit: string }

let company: TestCompany
let admin: Person
let manager: Person
let member: Person
let colleague: Person
let diesel: Source
let electricity: Source

beforeAll(async () => {
  company = await createCompany(api)
  admin = company.admin
  manager = await addMember(api, company, 'manager', 'Mia Manager')
  member = await addMember(api, company, 'member', 'Max Member')
  colleague = await addMember(api, company, 'member', 'Cleo Colleague')

  const { body } = await admin.get('/v1/company/sources?year=2025')
  const find = (pattern: RegExp) => {
    const source = body.sources.find((s: Source) => pattern.test(`${s.category} ${s.name}`))
    if (!source) throw new Error(`No template source like ${pattern}`)
    return source as Source
  }
  diesel = find(/Diesel \(average biofuel blend\)/)
  electricity = find(/Electricity: UK/)
})

/** Adds an entry as `person` and returns it (fails the test if refused). */
async function addEntry(person: Person, changes: Partial<{ sourceId: string; unit: string; amount: number; period: string; notes: string }> = {}) {
  const response = await person.post('/v1/emissions/entries', {
    sourceId: diesel.id,
    unit: 'litres',
    amount: 100,
    period: '2025-06',
    dataSource: 'Fuel card statement',
    ...changes,
  })
  expect(response.status, JSON.stringify(response.body)).toBe(201)
  return response.body
}

describe('adding entries', () => {
  test("the server calculates CO2e with the factor of the entry's year", async () => {
    for (const [period, year] of [['2021-03', 2021], ['2025-06', 2025]] as const) {
      const entry = await addEntry(member, { amount: 250.5, period })
      const factor = await storedFactor(api, diesel.id, 'litres', year)
      expect(entry).toMatchObject({ reportingYear: year, factorYear: year, kgCo2ePerUnit: factor, scope: 1, unit: 'litres' })
      expect(entry.co2eKg).toBeCloseTo(250.5 * factor!, 6)
    }
  })

  test('a CO2e figure sent by the browser is ignored', async () => {
    const response = await member.post('/v1/emissions/entries', {
      sourceId: diesel.id,
      unit: 'litres',
      amount: 10,
      period: '2025-01',
      co2eKg: 1,
      kgCo2ePerUnit: 0.0001,
    })
    expect(response.status).toBe(201)
    expect(response.body.co2eKg).toBeCloseTo(10 * (await storedFactor(api, diesel.id, 'litres', 2025))!, 6)
  })

  test('a year without published factors uses the latest earlier set (and says so)', async () => {
    // The newest published set is 2026; a 2026 entry must use exactly it
    const entry = await addEntry(member, { period: '2026-01' })
    expect(entry.factorYear).toBe(2026)
  })

  test('the reporting month, amount, source and unit are checked', async () => {
    const send = (changes: object) =>
      member.post('/v1/emissions/entries', { sourceId: diesel.id, unit: 'litres', amount: 5, period: '2025-02', ...changes })

    const nextYear = `${new Date().getUTCFullYear() + 1}-01`
    for (const invalid of [{ period: nextYear }, { period: '1989-12' }, { period: '2025-13' }, { amount: 0 }, { amount: -3 }, { amount: 1e13 }]) {
      const response = await send(invalid)
      expect(response.status, JSON.stringify(invalid)).toBe(400)
      expect(response.body.error.code).toBe('invalid_request')
    }

    // A library source the company doesn't track
    const { body } = await member.get('/v1/emission-sources?q=biogas&limit=1')
    const untracked = await send({ sourceId: body.items[0].id })
    expect(untracked.body.error.code).toBe('source_not_tracked')

    const wrongUnit = await send({ unit: 'parsecs' })
    expect(wrongUnit.status).toBe(400)
    expect(wrongUnit.body.error.code).toBe('unit_not_available')
  })

  test('new entries start Pending, also for Managers and Admins', async () => {
    for (const person of [member, manager, admin]) {
      const entry = await addEntry(person)
      expect(entry.status).toBe('pending')
      expect(entry.createdBy).toEqual({ id: person.id, name: person.name })
    }
  })
})

describe('verification workflow', () => {
  test('Members cannot verify, reject or reopen', async () => {
    const entry = await addEntry(colleague)
    expect((await member.post(`/v1/emissions/entries/${entry.id}/verify`)).status).toBe(403)
    expect((await member.post(`/v1/emissions/entries/${entry.id}/reject`, { reason: 'Looks wrong' })).status).toBe(403)
    expect((await member.post('/v1/emissions/entries/verify', { ids: [entry.id] })).status).toBe(403)
  })

  test('Managers may verify their own entries', async () => {
    const entry = await addEntry(manager)
    const verified = await manager.post(`/v1/emissions/entries/${entry.id}/verify`)
    expect(verified.status).toBe(200)
    expect(verified.body).toMatchObject({ status: 'verified', reviewedBy: { id: manager.id, name: manager.name } })
  })

  test('reject (with a reason), correct, verify, reopen: all in the history', async () => {
    const entry = await addEntry(member, { amount: 40 })

    const noReason = await manager.post(`/v1/emissions/entries/${entry.id}/reject`, { reason: ' ' })
    expect(noReason.status).toBe(400)
    const rejected = await manager.post(`/v1/emissions/entries/${entry.id}/reject`, { reason: 'The invoice says 45 litres' })
    expect(rejected.body).toMatchObject({ status: 'rejected', rejectionReason: 'The invoice says 45 litres' })

    // Correcting a rejected entry sends it back for review
    const corrected = await member.patch(`/v1/emissions/entries/${entry.id}`, { amount: 45 })
    expect(corrected.status).toBe(200)
    expect(corrected.body).toMatchObject({ status: 'pending', rejectionReason: null, amount: 45, reviewedBy: null })
    expect(corrected.body.co2eKg).toBeCloseTo(45 * entry.kgCo2ePerUnit, 6)

    expect((await manager.post(`/v1/emissions/entries/${entry.id}/verify`)).body.status).toBe('verified')
    // Verifying twice: it's no longer Pending
    const again = await manager.post(`/v1/emissions/entries/${entry.id}/verify`)
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('wrong_status')

    expect((await manager.post(`/v1/emissions/entries/${entry.id}/reopen`)).body.status).toBe('pending')

    const detail = await member.get(`/v1/emissions/entries/${entry.id}`)
    expect(detail.body.events.map((e: { action: string }) => e.action)).toEqual(['created', 'rejected', 'updated', 'verified', 'reopened'])
    expect(detail.body.events[1]).toMatchObject({ actor: { id: manager.id, name: manager.name }, details: { reason: 'The invoice says 45 litres' } })
  })

  test('verified entries are locked until reopened', async () => {
    const entry = await addEntry(member)
    await manager.post(`/v1/emissions/entries/${entry.id}/verify`)

    for (const person of [member, manager, admin]) {
      const edit = await person.patch(`/v1/emissions/entries/${entry.id}`, { amount: 1 })
      expect(edit.status).toBe(409)
      expect(edit.body.error.code).toBe('entry_locked')
      expect((await person.delete(`/v1/emissions/entries/${entry.id}`)).status).toBe(409)
    }
  })

  test("Members can change their own entries, not a colleague's; Managers can change any", async () => {
    const entry = await addEntry(colleague)
    expect((await member.patch(`/v1/emissions/entries/${entry.id}`, { amount: 2 })).status).toBe(403)
    expect((await member.delete(`/v1/emissions/entries/${entry.id}`)).status).toBe(403)
    expect((await colleague.patch(`/v1/emissions/entries/${entry.id}`, { notes: 'Checked' })).status).toBe(200)
    expect((await manager.patch(`/v1/emissions/entries/${entry.id}`, { amount: 3 })).status).toBe(200)
  })

  test('changing the month or unit recalculates with the right factor', async () => {
    const entry = await addEntry(member, { period: '2025-04', amount: 1000, sourceId: electricity.id, unit: 'kWh' })
    const moved = await member.patch(`/v1/emissions/entries/${entry.id}`, { period: '2021-04' })
    const factor2021 = await storedFactor(api, electricity.id, 'kWh', 2021)
    expect(moved.body).toMatchObject({ reportingYear: 2021, factorYear: 2021, kgCo2ePerUnit: factor2021, scope: 2 })
    expect(moved.body.co2eKg).toBeCloseTo(1000 * factor2021!, 6)
  })

  test('bulk verify verifies the Pending ones and skips the rest', async () => {
    const pending = [await addEntry(member), await addEntry(colleague), await addEntry(manager)]
    const alreadyVerified = await addEntry(member)
    await manager.post(`/v1/emissions/entries/${alreadyVerified.id}/verify`)

    const result = await admin.post('/v1/emissions/entries/verify', { ids: [...pending.map((e) => e.id), alreadyVerified.id] })
    expect(result.body).toEqual({ verified: 3, skipped: 1 })
    for (const entry of pending) expect((await admin.get(`/v1/emissions/entries/${entry.id}`)).body.status).toBe('verified')

    const tooMany = await admin.post('/v1/emissions/entries/verify', { ids: Array.from({ length: 101 }, () => crypto.randomUUID()) })
    expect(tooMany.status).toBe(400)
  })

  test('deleting keeps a record in the audit trail', async () => {
    const entry = await addEntry(member, { amount: 77 })
    expect((await member.delete(`/v1/emissions/entries/${entry.id}`)).status).toBe(204)
    expect((await member.get(`/v1/emissions/entries/${entry.id}`)).status).toBe(404)

    const { rows } = await api.db.execute<{ action: string; entry_id: string | null; actor_id: string; details: Record<string, unknown> }>(sql`
      select action, entry_id, actor_id, details from emission_entry_events
       where organization_id = ${company.id} and details->>'entryId' = ${entry.id}`)
    expect(rows).toEqual([
      expect.objectContaining({ action: 'deleted', entry_id: null, actor_id: member.id, details: expect.objectContaining({ amount: 77 }) }),
    ])
  })

  test('automatic verification (Admin setting) verifies new entries straight away', async () => {
    expect((await manager.patch('/v1/company/settings', { requireVerification: false })).status).toBe(403)
    expect((await admin.patch('/v1/company/settings', { requireVerification: false })).status).toBe(200)
    try {
      const entry = await addEntry(member)
      expect(entry.status).toBe('verified')
      const detail = await member.get(`/v1/emissions/entries/${entry.id}`)
      expect(detail.body.events).toEqual([
        expect.objectContaining({ action: 'created' }),
        expect.objectContaining({ action: 'verified', actor: null, details: { automatic: true } }),
      ])
    } finally {
      await admin.patch('/v1/company/settings', { requireVerification: true })
    }
  })
})

describe('other companies', () => {
  test("cannot read, change or verify this company's entries", async () => {
    const entry = await addEntry(member)
    const outsider = (await createCompany(api)).admin

    expect((await outsider.get(`/v1/emissions/entries/${entry.id}`)).status).toBe(404)
    expect((await outsider.patch(`/v1/emissions/entries/${entry.id}`, { amount: 1 })).status).toBe(404)
    expect((await outsider.delete(`/v1/emissions/entries/${entry.id}`)).status).toBe(404)
    expect((await outsider.post(`/v1/emissions/entries/${entry.id}/verify`)).status).toBe(404)
    expect((await outsider.post('/v1/emissions/entries/verify', { ids: [entry.id] })).body).toEqual({ verified: 0, skipped: 1 })
    expect((await outsider.get('/v1/emissions/entries')).body.total).toBe(0) // no year: all years

    expect((await member.get(`/v1/emissions/entries/${entry.id}`)).body.status).toBe('pending')
  })
})

describe('lists and the dashboard summary', () => {
  // A separate company, so the numbers don't depend on the other tests
  let reporting: TestCompany
  let reviewer: Person

  beforeAll(async () => {
    reporting = await createCompany(api)
    reviewer = await addMember(api, reporting, 'manager', 'Rita Reviewer')
    const { body } = await reporting.admin.get('/v1/company/sources?year=2024')
    const fuel = body.sources.find((s: Source) => s.id === diesel.id)
    const power = body.sources.find((s: Source) => s.id === electricity.id)

    // 2024: 12 months of electricity + diesel in odd months; 2023: three months (for the comparison)
    const add = (sourceId: string, unit: string, amount: number, period: string) =>
      reporting.admin.post('/v1/emissions/entries', { sourceId, unit, amount, period })
    for (let month = 1; month <= 12; month++) {
      const period = `2024-${String(month).padStart(2, '0')}`
      expect((await add(power.id, 'kWh', 10_000 + month, period)).status).toBe(201)
      if (month % 2 === 1) expect((await add(fuel.id, 'litres', 300 + month, period)).status).toBe(201)
    }
    for (const month of ['01', '02', '03']) await add(power.id, 'kWh', 12_000, `2023-${month}`)

    // Verify everything except March-2024; reject the May diesel entry
    const all = await reporting.admin.get('/v1/emissions/entries?year=2024&limit=50')
    const may = all.body.items.find((e: { period: string; scope: number }) => e.period === '2024-05' && e.scope === 1)
    await reviewer.post(`/v1/emissions/entries/${may.id}/reject`, { reason: 'Duplicate of the April card statement' })
    const toVerify = all.body.items
      .filter((e: { id: string; period: string }) => e.period !== '2024-03' && e.id !== may.id)
      .map((e: { id: string }) => e.id)
    expect((await reviewer.post('/v1/emissions/entries/verify', { ids: toVerify })).body.verified).toBe(toVerify.length)
  })

  test('keyset pages return every entry once, newest month first', async () => {
    const seen: { id: string; period: string }[] = []
    let cursor: string | null = null
    let first = true
    do {
      const query = `/v1/emissions/entries?year=2024&limit=4${cursor ? `&cursor=${cursor}` : ''}`
      const page: { body: { items: { id: string; period: string }[]; nextCursor: string | null; total: number | null } } =
        await reporting.admin.get(query)
      if (first) expect(page.body.total).toBe(18)
      else expect(page.body.total).toBeNull()
      first = false
      seen.push(...page.body.items)
      cursor = page.body.nextCursor
    } while (cursor)

    expect(seen).toHaveLength(18)
    expect(new Set(seen.map((e) => e.id)).size).toBe(18)
    const periods = seen.map((e) => e.period)
    expect(periods).toEqual([...periods].sort().reverse())
  })

  test('filters by status, scope and year run in the database', async () => {
    const list = (query: string) => reporting.admin.get(`/v1/emissions/entries?${query}&limit=50`)
    expect((await list('year=2024&status=pending')).body.total).toBe(2) // March: electricity + diesel
    expect((await list('year=2024&status=rejected')).body.total).toBe(1)
    expect((await list('year=2024&scope=1')).body.total).toBe(6)
    expect((await list('year=2023')).body.total).toBe(3)
    expect((await list('')).body.total).toBe(21) // no year: every year (the app picks this year by default)
    expect((await reporting.admin.get('/v1/emissions/entries?cursor=not-a-cursor')).status).toBe(400)
  })

  test('the summary matches a plain SQL sum and leaves rejected entries out', async () => {
    const { body } = await reviewer.get('/v1/emissions/summary?year=2024')
    const { rows } = await api.db.execute<{ status: string; scope: number; kg: string; n: string }>(sql`
      select status, scope, sum(co2e_kg) as kg, count(*) as n from emission_entries
       where organization_id = ${reporting.id} and reporting_year = 2024
       group by status, scope`)
    const kg = (filter: (row: { status: string; scope: number }) => boolean) =>
      rows.filter(filter).reduce((sum, row) => sum + Number(row.kg), 0)

    expect(body.totalKg).toBeCloseTo(kg((row) => row.status !== 'rejected'), 3)
    expect(body.byScope[1]).toBeCloseTo(kg((row) => row.status !== 'rejected' && row.scope === 1), 3)
    expect(body.byScope[2]).toBeCloseTo(kg((row) => row.status !== 'rejected' && row.scope === 2), 3)
    expect(body.pendingKg).toBeCloseTo(kg((row) => row.status === 'pending'), 3)
    expect(body.pendingEntries).toBe(2)

    expect(body.months).toHaveLength(12)
    expect(body.months.reduce((sum: number, m: { total: number }) => sum + m.total, 0)).toBeCloseTo(body.totalKg, 3)
    expect(body.months.every((m: { hasData: boolean }) => m.hasData)).toBe(true)
    expect(body.lastMonthWithData).toBe(11) // an index: 0 = January, -1 = no data
    expect(body.years).toEqual([2024, 2023])
    // 2023 only has January to March, so a Jan-Dec comparison would be misleading
    expect(body.previousYearSamePeriod.complete).toBe(false)
  })

  test('the previous-year comparison uses the same months only', async () => {
    const { body } = await reviewer.get('/v1/emissions/summary?year=2023')
    expect(body.lastMonthWithData).toBe(2) // March
    expect(body.months.filter((m: { hasData: boolean }) => m.hasData)).toHaveLength(3)
    // No 2022 data at all
    expect(body.previousYearSamePeriod).toEqual({ totalKg: 0, complete: false })
  })
})
