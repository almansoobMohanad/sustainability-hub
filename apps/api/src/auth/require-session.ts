import { createMiddleware } from 'hono/factory'
import type { ApiError } from '../app'
import type { Auth } from './auth'

/*
  Protects /api/v1 endpoints: only signed-in people get through. Every data
  endpoint uses this (directly or via a company check built on it).

  The session comes from the httpOnly cookie and is checked against the
  database by Better Auth, so it can't be forged or kept alive after sign-out
  or a password reset. Handlers then read c.var.user and c.var.session, never
  anything identity-related from the request body or URL.
*/

type SessionData = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>

export type AuthVariables = {
  user: SessionData['user']
  session: SessionData['session']
}

export function requireSession(auth: Auth) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const result = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!result) {
      return c.json<ApiError>({ error: { code: 'unauthorized', message: 'Sign in to continue.' } }, 401)
    }
    c.set('user', result.user)
    c.set('session', result.session)
    // Personal data: never store it in browser or proxy caches
    c.header('Cache-Control', 'no-store')
    await next()
  })
}
