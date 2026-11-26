import { describe, expect, test } from 'vitest'
import { createTestApi, linkIn, PASSWORD, Person, signUp, uniqueEmail } from './support/test-api'

/*
  Sign-up, email verification, sign-in, password reset and rate limits
  (the email/password rules in AGENTS.md section 2a).
*/

const api = createTestApi()

describe('health', () => {
  test('reports ok when the database answers', async () => {
    const response = await new Person(api, uniqueEmail(), 'Anyone').get('/health')
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('ok')
    // No HUB_VERSION in tests (only builds write one into the bundle)
    expect(response.body.version).toBeNull()
  })

  test('unknown endpoints answer with the JSON error shape', async () => {
    const response = await new Person(api, uniqueEmail(), 'Anyone').get('/v1/nothing-here')
    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('not_found')
  })
})

describe('sign-up and email verification', () => {
  test('a new account cannot sign in before the email is verified', async () => {
    const email = uniqueEmail()
    const person = new Person(api, email, 'Unverified')
    expect((await person.post('/auth/sign-up/email', { name: 'Unverified', email, password: PASSWORD })).status).toBe(200)

    const signIn = await person.post('/auth/sign-in/email', { email, password: PASSWORD })
    expect(signIn.status).toBe(403)
    expect(signIn.body.code).toBe('EMAIL_NOT_VERIFIED')
    expect((await person.get('/v1/me')).status).toBe(401)
  })

  test('the verification link verifies the email and signs the person in', async () => {
    const person = await signUp(api, 'Vera Verified')
    const me = await person.get('/v1/me')
    expect(me.body.user).toMatchObject({ email: person.email, name: 'Vera Verified' })
    expect(me.body.companies).toEqual([])
    expect(me.body.activeCompanyId).toBeNull()
  })

  test('signing up with a registered email answers the same and emails the owner instead', async () => {
    const owner = await signUp(api, 'Owner')
    const impostor = new Person(api, owner.email, 'Impostor')
    const again = await impostor.post('/auth/sign-up/email', { name: 'Impostor', email: owner.email, password: `${PASSWORD}-2` })
    expect(again.status).toBe(200) // no "this email is taken" (account enumeration)

    const notice = await api.emailTo(owner.email, /already have a .* account/i)
    expect(notice.text).toContain('/sign-in')
    // The impostor's password does not work
    const signIn = await impostor.post('/auth/sign-in/email', { email: owner.email, password: `${PASSWORD}-2` })
    expect(signIn.status).toBe(401)
  })

  test('passwords shorter than 12 characters are refused', async () => {
    const email = uniqueEmail()
    const response = await new Person(api, email, 'Short').post('/auth/sign-up/email', { name: 'Short', email, password: 'short-pass' })
    expect(response.status).toBe(400)
    expect(response.body.code).toBe('PASSWORD_TOO_SHORT')
  })
})

describe('sign-in and sign-out', () => {
  test('a wrong password gets the same generic error as an unknown email', async () => {
    const person = await signUp(api)
    const wrongPassword = await new Person(api, person.email, '').post('/auth/sign-in/email', { email: person.email, password: 'wrong-password-123' })
    const unknownEmail = await new Person(api, uniqueEmail(), '').post('/auth/sign-in/email', { email: uniqueEmail(), password: PASSWORD })
    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    expect(wrongPassword.body.code).toBe(unknownEmail.body.code)
  })

  test('signing out ends the session', async () => {
    const person = await signUp(api)
    expect((await person.post('/auth/sign-out')).status).toBe(200)
    expect((await person.get('/v1/me')).status).toBe(401)
  })

  test('data endpoints need a session and are never cached', async () => {
    const person = await signUp(api)
    const me = await person.get('/v1/me')
    expect(me.headers.get('cache-control')).toBe('no-store')

    person.forgetCookies()
    const signedOut = await person.get('/v1/me')
    expect(signedOut.status).toBe(401)
    expect(signedOut.body.error.code).toBe('unauthorized')
  })

  test('sign-in is limited to 5 attempts per minute per IP address', async () => {
    const person = await signUp(api)
    const attacker = new Person(api, person.email, 'Attacker')
    const statuses: number[] = []
    for (let attempt = 0; attempt < 6; attempt++) {
      statuses.push((await attacker.post('/auth/sign-in/email', { email: person.email, password: 'wrong-password-123' })).status)
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401])
    expect(statuses[5]).toBe(429)
    // Someone else (another IP) is not affected
    const owner = new Person(api, person.email, 'Owner')
    expect((await owner.post('/auth/sign-in/email', { email: person.email, password: PASSWORD })).status).toBe(200)
  })
})

describe('password reset', () => {
  test('resets the password, signs out other sessions and works only once', async () => {
    const person = await signUp(api)
    const otherDevice = new Person(api, person.email, 'Other device')
    expect((await otherDevice.post('/auth/sign-in/email', { email: person.email, password: PASSWORD })).status).toBe(200)

    const requested = await new Person(api, person.email, '').post('/auth/request-password-reset', {
      email: person.email,
      redirectTo: '/reset-password',
    })
    expect(requested.status).toBe(200)

    // The email link goes through the API, which redirects to the app's page with the token
    const link = linkIn(await api.emailTo(person.email, /reset/i))
    const token = new URL(link).pathname.split('/').at(-1)!
    const newPassword = 'a-brand-new-password-42'
    const reset = await new Person(api, person.email, '').post('/auth/reset-password', { token, newPassword })
    expect(reset.status).toBe(200)

    // Every session ended (a reset can mean a stolen account)
    expect((await person.get('/v1/me')).status).toBe(401)
    expect((await otherDevice.get('/v1/me')).status).toBe(401)
    // Old password refused, new one works
    const fresh = new Person(api, person.email, '')
    expect((await fresh.post('/auth/sign-in/email', { email: person.email, password: PASSWORD })).status).toBe(401)
    expect((await fresh.post('/auth/sign-in/email', { email: person.email, password: newPassword })).status).toBe(200)
    // The owner is told about the change
    await api.emailTo(person.email, /password (was )?changed/i)

    // The link can't be used twice
    const reused = await new Person(api, person.email, '').post('/auth/reset-password', { token, newPassword: 'yet-another-password-7' })
    expect(reused.status).toBe(400)
  })

  test('asking for a reset gives the same answer for unknown emails (and sends nothing)', async () => {
    const email = uniqueEmail('nobody')
    const response = await new Person(api, email, '').post('/auth/request-password-reset', { email, redirectTo: '/reset-password' })
    expect(response.status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(api.emails.some((e) => e.to === email)).toBe(false)
  })
})
