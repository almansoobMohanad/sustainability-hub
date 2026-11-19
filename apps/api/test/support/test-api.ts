import { randomBytes, randomInt } from 'node:crypto'
import { afterAll, expect, inject } from 'vitest'
import { createDb, sql } from '@hub/db'
import { createApp } from '../../src/app'
import { createAuth } from '../../src/auth/auth'
import type { Email, Mailer } from '../../src/email/mailer'

/*
  Test helpers: the real API (createApp + Better Auth) on the test database,
  called in-process with app.request() (no port, no network).

  - Emails go to a fake mailer that keeps them in memory, so tests can follow
    verification, reset and invitation links like a person would.
  - Every Person has its own cookie jar and its own client IP. Rate limits are
    on (as in production) and counted per IP, so sharing one IP would make
    unrelated tests hit "too many requests".
  - The breached-password check is off: it calls an outside service, and tests
    must not depend on the internet.
*/

export const APP_URL = 'http://localhost:5174'
export const PASSWORD = 'correct-horse-battery-staple'

export type ApiResponse<T = any> = { status: number; body: T; headers: Headers }

/** Starts an API for one test file; closed automatically after the file's tests. */
export function createTestApi() {
  const { db, pool } = createDb(inject('databaseUrl'))
  const emails: Email[] = []
  const mailer: Mailer = {
    async send(email) {
      emails.push(email)
    },
  }
  const auth = createAuth({
    db,
    mailer,
    appUrl: APP_URL,
    secret: 'test-secret-that-is-at-least-32-characters-long',
    checkBreachedPasswords: false,
  })
  const app = createApp({ db, auth, trustedProxyHops: 0, googleSignIn: false, logRequests: false })
  afterAll(() => pool.end())

  /** The latest email to `to` whose subject matches (sending happens in the background: wait briefly). */
  async function emailTo(to: string, subject: RegExp) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const email = emails.findLast((e) => e.to === to && subject.test(e.subject))
      if (email) return email
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error(`No email to ${to} with a subject like ${subject}. Sent: ${emails.map((e) => `${e.to}: ${e.subject}`).join('; ')}`)
  }

  return { app, db, emails, emailTo }
}

export type TestApi = ReturnType<typeof createTestApi>

/** Somebody using the API: a browser with its own cookies and IP address. */
export class Person {
  readonly ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`
  private cookies = new Map<string, string>()
  private readonly api: TestApi
  readonly email: string
  readonly name: string
  id = ''

  constructor(api: TestApi, email: string, name: string) {
    this.api = api
    this.email = email
    this.name = name
  }

  /** A request to /api<path>, sent the way the app sends it (same origin, cookies, JSON). */
  async request<T = any>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const headers = new Headers({ Origin: APP_URL })
    if (this.cookies.size) headers.set('Cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '))
    if (body !== undefined) headers.set('Content-Type', 'application/json')

    const response = await this.api.app.request(
      `${APP_URL}/api${path}`,
      { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' },
      // What @hono/node-server would pass: the TCP connection (client IP for rate limits)
      { incoming: { socket: { remoteAddress: this.ip, remotePort: 50_000, remoteFamily: 'IPv4' } } },
    )

    for (const cookie of response.headers.getSetCookie()) {
      const [pair, ...attributes] = cookie.split(';')
      const separator = pair.indexOf('=')
      const name = pair.slice(0, separator).trim()
      const value = pair.slice(separator + 1).trim()
      const expired = attributes.some((a) => /^\s*max-age=0\s*$/i.test(a))
      if (!value || expired) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }

    const text = await response.text()
    const json = response.headers.get('content-type')?.includes('application/json') && text ? JSON.parse(text) : text
    return { status: response.status, body: json as T, headers: response.headers }
  }

  get = <T = any>(path: string) => this.request<T>('GET', path)
  post = <T = any>(path: string, body: unknown = {}) => this.request<T>('POST', path, body)
  patch = <T = any>(path: string, body: unknown) => this.request<T>('PATCH', path, body)
  delete = <T = any>(path: string) => this.request<T>('DELETE', path)

  /** Opens a link from an email (an absolute app URL whose path starts with /api). */
  openLink(link: string) {
    const url = new URL(link)
    expect(url.origin).toBe(APP_URL)
    expect(url.pathname.startsWith('/api/')).toBe(true)
    return this.get(url.pathname.slice('/api'.length) + url.search)
  }

  forgetCookies() {
    this.cookies.clear()
  }
}

/** A unique address for this run (the test database is dropped before the next one). */
export function uniqueEmail(label = 'person') {
  return `${label}.${randomBytes(5).toString('hex')}@example.com`
}

/** The first link in an email's text. */
export function linkIn(email: Email) {
  const link = email.text.match(/https?:\/\/\S+/)?.[0]
  if (!link) throw new Error(`No link in the email "${email.subject}"`)
  return link
}

/** Signs up, follows the verification link (which signs them in) and returns the person. */
export async function signUp(api: TestApi, name = 'Test Person', email = uniqueEmail()) {
  const person = new Person(api, email, name)
  const signUp = await person.post('/auth/sign-up/email', { name, email, password: PASSWORD })
  expect(signUp.status, JSON.stringify(signUp.body)).toBe(200)

  const verification = await api.emailTo(email, /verify/i)
  const verified = await person.openLink(linkIn(verification))
  expect(verified.status).toBe(302)

  const me = await person.get('/v1/me')
  expect(me.status).toBe(200)
  person.id = me.body.user.id
  return person
}

export type Role = 'admin' | 'manager' | 'member'

export type TestCompany = { id: string; admin: Person }

/** A new company (its creator is the Admin and it becomes their active company). */
export async function createCompany(
  api: TestApi,
  { admin, sector = 'manufacturing', template = true }: { admin?: Person; sector?: string; template?: boolean } = {},
): Promise<TestCompany> {
  admin ??= await signUp(api, 'Ada Admin')
  const name = `Test Company ${randomBytes(3).toString('hex')}`
  const created = await admin.post('/auth/organization/create', { name, slug: name.toLowerCase().replaceAll(' ', '-') })
  expect(created.status, JSON.stringify(created.body)).toBe(200)

  expect((await admin.patch('/v1/company/settings', { sector })).status).toBe(200)
  if (template) {
    const { body } = await admin.get(`/v1/sector-templates/${sector}`)
    const added = await admin.post('/v1/company/sources', {
      sources: body.sources.map((s: { id: string; defaultUnit: string }) => ({ sourceId: s.id, defaultUnit: s.defaultUnit })),
    })
    expect(added.status).toBe(200)
  }
  return { id: created.body.id, admin }
}

/** Invites a new person with a role; they accept (it becomes their active company). */
export async function addMember(api: TestApi, company: TestCompany, role: Role, name = `Test ${role}`) {
  const person = await signUp(api, name)
  const invited = await company.admin.post('/auth/organization/invite-member', {
    email: person.email,
    role,
    organizationId: company.id,
  })
  expect(invited.status, JSON.stringify(invited.body)).toBe(200)
  const accepted = await person.post('/auth/organization/accept-invitation', { invitationId: invited.body.id })
  expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)
  return person
}

/** The factor stored in the library for exactly this source, unit and year (null if that year has none). */
export async function storedFactor(api: TestApi, sourceId: string, unit: string, year: number) {
  const { rows } = await api.db.execute<{ value: string }>(sql`
    select f.kg_co2e_per_unit as value
      from emission_factors f join factor_sets s on s.id = f.factor_set_id
     where f.source_id = ${sourceId} and f.unit = ${unit} and s.year = ${year}`)
  return rows[0] ? Number(rows[0].value) : null
}
