import { beforeAll, describe, expect, test } from 'vitest'
import { addMember, createCompany, createTestApi, linkIn, signUp, type Person, type TestCompany } from './support/test-api'

/*
  Companies, roles and invitations: who may do what (packages/shared/src/permissions.ts),
  and that company data never leaks to people outside the company.
*/

const api = createTestApi()

let company: TestCompany
let manager: Person
let member: Person
let outsider: Person

beforeAll(async () => {
  company = await createCompany(api)
  manager = await addMember(api, company, 'manager', 'Mia Manager')
  member = await addMember(api, company, 'member', 'Max Member')
  outsider = (await createCompany(api)).admin
})

describe('membership', () => {
  test('the creator is the Admin and the company is active', async () => {
    const me = await company.admin.get('/v1/me')
    expect(me.body.activeCompanyId).toBe(company.id)
    expect(me.body.companies).toEqual([expect.objectContaining({ id: company.id, role: 'admin' })])
  })

  test('invited people join with the role they were given', async () => {
    expect((await manager.get('/v1/me')).body.companies).toEqual([expect.objectContaining({ id: company.id, role: 'manager' })])
    expect((await member.get('/v1/me')).body.companies).toEqual([expect.objectContaining({ id: company.id, role: 'member' })])
  })

  test('the invitation email links to the invitation page in the app', async () => {
    const email = await api.emailTo(member.email, /invited you/i)
    expect(linkIn(email)).toMatch(/^http:\/\/localhost:5174\/invitations\/[0-9a-f-]{36}$/)
  })

  test('only Admins can invite people', async () => {
    for (const person of [manager, member]) {
      const response = await person.post('/auth/organization/invite-member', {
        email: 'someone@example.com',
        role: 'member',
        organizationId: company.id,
      })
      expect(response.status).toBe(403)
    }
  })

  test('an invitation can only be accepted by the invited email', async () => {
    const invited = await company.admin.post('/auth/organization/invite-member', {
      email: 'invited.person@example.com',
      role: 'member',
      organizationId: company.id,
    })
    expect(invited.status).toBe(200)
    const accepted = await outsider.post('/auth/organization/accept-invitation', { invitationId: invited.body.id })
    expect(accepted.status).toBe(403)
    expect((await outsider.get('/v1/me')).body.companies.map((c: { id: string }) => c.id)).not.toContain(company.id)
  })

  test('a company always keeps an Admin', async () => {
    const leave = await company.admin.post('/auth/organization/leave', { organizationId: company.id })
    expect(leave.status).toBe(400)
  })
})

describe('company settings', () => {
  test('everyone in the company can read them', async () => {
    for (const person of [company.admin, manager, member]) {
      const settings = await person.get('/v1/company/settings')
      expect(settings.status).toBe(200)
      expect(settings.body).toEqual({ sector: 'manufacturing', requireVerification: true, baselineYear: null })
    }
  })

  test('only Admins can change them', async () => {
    expect((await manager.patch('/v1/company/settings', { sector: 'retail' })).status).toBe(403)
    expect((await member.patch('/v1/company/settings', { requireVerification: false })).status).toBe(403)
    const changed = await company.admin.patch('/v1/company/settings', { sector: 'office' })
    expect(changed.body).toEqual({ sector: 'office', requireVerification: true, baselineYear: null })
    await company.admin.patch('/v1/company/settings', { sector: 'manufacturing' })
  })

  test('validation errors use the API error shape', async () => {
    const response = await company.admin.patch('/v1/company/settings', { sector: 'space-mining' })
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('invalid_request')
    expect((await company.admin.patch('/v1/company/settings', {})).status).toBe(400)
  })

  test('someone without a company gets a clear error', async () => {
    const newcomer = await signUp(api)
    const response = await newcomer.get('/v1/company/settings')
    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('no_active_company')
  })
})

describe('emission sources of the company', () => {
  test('the sector template was added with default units', async () => {
    const { body } = await member.get('/v1/company/sources?year=2025')
    expect(body.year).toBe(2025)
    expect(body.sources.length).toBeGreaterThan(10)
    for (const source of body.sources) {
      expect(source.defaultUnit).toBeTruthy()
      expect(source.factors.map((f: { unit: string }) => f.unit)).toContain(source.defaultUnit)
    }
  })

  test('Admins and Managers can add and remove sources, Members cannot', async () => {
    const search = await member.get('/v1/emission-sources?q=biogas&limit=1')
    const sourceId = search.body.items[0].id

    expect((await member.post('/v1/company/sources', { sources: [{ sourceId }] })).status).toBe(403)
    expect((await manager.post('/v1/company/sources', { sources: [{ sourceId }] })).body).toEqual({ added: 1 })
    // Adding it again changes nothing
    expect((await company.admin.post('/v1/company/sources', { sources: [{ sourceId }] })).body).toEqual({ added: 0 })

    expect((await member.delete(`/v1/company/sources/${sourceId}`)).status).toBe(403)
    expect((await manager.delete(`/v1/company/sources/${sourceId}`)).status).toBe(204)
    expect((await manager.delete(`/v1/company/sources/${sourceId}`)).status).toBe(404)
  })

  test('unknown sources are refused', async () => {
    const response = await company.admin.post('/v1/company/sources', {
      sources: [{ sourceId: '00000000-0000-4000-8000-000000000000' }],
    })
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('unknown_source')
  })

  test('each company has its own list', async () => {
    // Both companies started from the same template; removing a source from one leaves the other alone
    const removed = (await company.admin.get('/v1/company/sources')).body.sources[0].id
    expect((await company.admin.delete(`/v1/company/sources/${removed}`)).status).toBe(204)
    const theirs = await outsider.get('/v1/company/sources')
    expect(theirs.body.sources.map((s: { id: string }) => s.id)).toContain(removed)
    await company.admin.post('/v1/company/sources', { sources: [{ sourceId: removed }] })
  })
})

describe('outsiders', () => {
  test('cannot switch to a company they are not in', async () => {
    const response = await outsider.post('/auth/organization/set-active', { organizationId: company.id })
    expect(response.status).toBe(403)
  })

  test('a removed member loses access immediately', async () => {
    const leaving = await addMember(api, company, 'member', 'Leo Leaving')
    expect((await leaving.get('/v1/company/settings')).status).toBe(200)

    const removed = await company.admin.post('/auth/organization/remove-member', {
      memberIdOrEmail: leaving.email,
      organizationId: company.id,
    })
    expect(removed.status).toBe(200)
    const after = await leaving.get('/v1/company/settings')
    expect(after.status).toBe(403)
  })
})
