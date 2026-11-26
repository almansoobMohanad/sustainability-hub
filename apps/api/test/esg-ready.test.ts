import { beforeAll, describe, expect, test } from 'vitest'
import { addMember, createCompany, createTestApi, type Person, type TestCompany } from './support/test-api'

/*
  ESG Ready (MITI's ESG readiness self-assessment): who may see and edit it,
  the filled-in company details, saving (validation, merging, removing) and
  the edit history. The questions and the score: @hub/shared/esg-ready (unit
  tested there).
*/

const api = createTestApi()

let company: TestCompany
let admin: Person
let manager: Person
let member: Person

beforeAll(async () => {
  company = await createCompany(api, { template: false })
  admin = company.admin
  manager = await addMember(api, company, 'manager', 'Mia Manager')
  member = await addMember(api, company, 'member', 'Max Member')
})

const read = async (person: Person, year: number) => {
  const response = await person.get(`/v1/reports/esg-ready/${year}`)
  expect(response.status, JSON.stringify(response.body)).toBe(200)
  return response.body
}
const save = (person: Person, year: number, answers: Record<string, unknown>) =>
  person.patch(`/v1/reports/esg-ready/${year}`, { answers })

describe('who can see it', () => {
  test('Admins and Managers can; Members get 403 on every endpoint', async () => {
    expect((await admin.get('/v1/reports/esg-ready/2025')).status).toBe(200)
    expect((await manager.get('/v1/reports/esg-ready/2025')).status).toBe(200)
    expect((await member.get('/v1/reports/esg-ready/2025')).status).toBe(403)
    expect((await save(member, 2025, { q8_maturity: 'a' })).status).toBe(403)
    expect((await member.get('/v1/reports/esg-ready/2025/history')).status).toBe(403)
  })

  test("another company never sees this company's answers", async () => {
    expect((await save(admin, 2024, { q8_maturity: 'd' })).status).toBe(200)
    const other = await createCompany(api, { template: false })
    expect((await read(other.admin, 2024)).answers).toEqual({})
  })

  test('a future year is refused', async () => {
    const next = new Date().getFullYear() + 1
    expect((await admin.get(`/v1/reports/esg-ready/${next}`)).status).toBe(400)
    expect((await save(admin, next, { q8_maturity: 'a' })).status).toBe(400)
  })
})

test('an empty questionnaire: company name and the reader’s email filled in, this year and last offered', async () => {
  const empty = await read(manager, 2022)
  expect(empty).toMatchObject({ year: 2022, answers: {}, updatedAt: null, updatedBy: null })
  expect(empty.automatic.companyName.value).toMatch(/^Test Company/)
  expect(empty.automatic.userEmail.value).toBe(manager.email)
  const thisYear = new Date().getFullYear()
  expect(empty.years).toEqual(expect.arrayContaining([thisYear, thisYear - 1, 2022]))
})

describe('saving', () => {
  const year = 2023

  test('answers are checked with the same rules as the form', async () => {
    expect((await save(admin, year, { no_such_question: 'a' })).body.error.message).toMatch(/Unknown question/)
    expect((await save(admin, year, { q8_maturity: 'z' })).body.error.message).toMatch(/^Q8: /)
    expect((await save(admin, year, { q9_stakeholders: ['none', 'customers'] })).status).toBe(400)
    expect((await save(admin, year, { q9_stakeholders: 'customers' })).status).toBe(400)
    expect((await save(admin, year, { phone: '   ' })).status).toBe(400)
    expect((await admin.patch(`/v1/reports/esg-ready/${year}`, { answers: {} })).status).toBe(400)
  })

  test('two people saving different answers keep both; null removes one', async () => {
    await Promise.all([
      save(admin, year, { location: 'selangor', q9_stakeholders: ['community', 'customers'] }),
      save(manager, year, { q17_carbon: 'c', phone: ' +60 12  345 6789 ' }),
    ])
    let saved = await read(admin, year)
    expect(saved.answers).toEqual({
      location: 'selangor',
      q9_stakeholders: ['customers', 'community'], // stored in the list's order
      q17_carbon: 'c',
      phone: '+60 12 345 6789',
    })

    const removed = await save(manager, year, { q17_carbon: null, q18_ghg: 'b' })
    expect(removed.body.updatedBy.name).toBe('Mia Manager')
    saved = await read(admin, year)
    expect(saved.answers.q17_carbon).toBeUndefined()
    expect(saved.answers.q18_ghg).toBe('b')
    expect(saved.updatedBy.name).toBe('Mia Manager')
  })
})

test('history: question numbers, one line per person and session', async () => {
  const year = 2021
  await save(admin, year, { q8_maturity: 'b' })
  await save(admin, year, { location: 'johor', q10_business_case: 'c' })
  await save(manager, year, { q42_data_privacy: 'd' })
  const { body } = await admin.get(`/v1/reports/esg-ready/${year}/history`)
  expect(body.items).toHaveLength(2)
  expect(body.items[0]).toMatchObject({ actor: { name: 'Mia Manager' }, changed: ['Q42'] })
  expect(body.items[1]).toMatchObject({ actor: { name: 'Ada Admin' }, changed: ['Q10', 'Q2', 'Q8'] })
  expect(body.nextCursor).toBeNull()
  expect((await admin.get(`/v1/reports/esg-ready/${year}/history?cursor=nonsense`)).status).toBe(400)
})
