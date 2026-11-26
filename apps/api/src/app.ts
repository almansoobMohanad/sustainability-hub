import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { Hono, type ErrorHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import type { Database } from '@hub/db'
import { appContentSecurityPolicy, serveAppFiles } from './app-files'
import { SECURE_HEADERS } from './security-headers'
import type { Auth } from './auth/auth'
import { clientIp } from './auth/client-ip'
import { authOptionsRoutes } from './routes/auth-options'
import { companyRoutes } from './routes/company'
import { emissionRoutes } from './routes/emissions'
import { sedgRoutes } from './routes/sedg'
import { esgReadyRoutes } from './routes/esg-ready'
import { factorLibraryRoutes } from './routes/factor-library'
import { healthRoutes } from './routes/health'
import { meRoutes } from './routes/me'

/*
  Builds the Hono app. Kept separate from index.ts (which starts the server)
  so tests can call app.request('/api/health') without opening a port.

  URL layout:
    /api/health         system status (unversioned, for infrastructure)
    /api/auth/...       sign-up, sign-in, sessions, email verification (Better Auth)
    /api/v1/...         the REST API the web app uses
    /api/openapi.json   machine-readable description of every endpoint
    /api/docs           interactive API docs generated from it
    everything else     the built app, when `appFiles` is given (app-files.ts)
*/

/** Every error response has this shape, so the web app can handle them in one place. */
export type ApiError = { error: { code: string; message: string } }

type AppDeps = {
  db: Database
  auth: Auth
  /** See TRUST_PROXY_HOPS in env.ts */
  trustedProxyHops: number
  /** See CLIENT_IP_HEADER in env.ts */
  clientIpHeader?: string
  /** Folder of the built app to serve next to /api (APP_FILES_DIR); its address decides https */
  appFiles?: { dir: string; appUrl: string }
  /** Whether "Continue with Google" is configured */
  googleSignIn: boolean
  /** Print one line per request (default true; the tests turn it off) */
  logRequests?: boolean
}

/**
 * Request logs must never contain secrets. Password-reset links carry their
 * token in the path and verification links in the query string; anyone who can
 * read logs could use them. Replace them before printing.
 */
function redactSecrets(line: string) {
  return line
    .replace(/(\/reset-password\/)[^\s?/]+/g, '$1[redacted]')
    .replace(/([?&](?:token|code)=)[^\s&]+/g, '$1[redacted]')
}

export function createApp({
  db,
  auth,
  trustedProxyHops,
  clientIpHeader,
  appFiles,
  googleSignIn,
  logRequests = true,
}: AppDeps) {
  const root = new Hono()
  root.use(requestId()) // X-Request-Id header, handy for matching logs to requests
  if (logRequests) root.use(logger((line, ...rest) => console.log(redactSecrets(line), ...rest)))
  root.use(secureHeaders(SECURE_HEADERS))

  const app = new OpenAPIHono().basePath('/api')

  app.route('/', healthRoutes(db))
  app.route('/', authOptionsRoutes({ google: googleSignIn }))
  app.route('/', meRoutes({ db, auth }))
  app.route('/', factorLibraryRoutes({ db, auth }))
  app.route('/', companyRoutes({ db, auth }))
  app.route('/', emissionRoutes({ db, auth }))
  app.route('/', sedgRoutes({ db, auth }))
  app.route('/', esgReadyRoutes({ db, auth }))

  // Authentication: everything under /api/auth is handled by Better Auth.
  // Auth requests are small; refuse big bodies before they're read.
  app.use('/auth/*', bodyLimit({ maxSize: 64 * 1024 }), clientIp({ trustedProxyHops, header: clientIpHeader }))
  app.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw))

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Sustainability Hub API', version: '0.1.0' },
  })
  app.get('/docs', Scalar({ url: '/api/openapi.json', pageTitle: 'Sustainability Hub API' }))

  // Unexpected errors: log the details on the server, never send them to the
  // client (stack traces can leak internals).
  const onError: ErrorHandler = (err, c) => {
    console.error(`[${c.get('requestId')}]`, err)
    return c.json<ApiError>({ error: { code: 'internal_error', message: 'Something went wrong' } }, 500)
  }
  app.onError(onError)
  root.onError(onError)

  root.route('/', app)
  if (appFiles) {
    serveAppFiles(root, {
      dir: appFiles.dir,
      contentSecurityPolicy: appContentSecurityPolicy({ https: appFiles.appUrl.startsWith('https://') }),
    })
  }

  // Unknown /api addresses (and, without app files, everything else) get a JSON answer
  root.notFound((c) =>
    c.json<ApiError>({ error: { code: 'not_found', message: `No endpoint at ${c.req.method} ${c.req.path}` } }, 404),
  )

  return root
}
