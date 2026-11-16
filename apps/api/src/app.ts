import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import type { Database } from '@hub/db'
import { healthRoutes } from './routes/health'

/*
  Builds the Hono app. Kept separate from index.ts (which starts the server)
  so tests can call app.request('/api/health') without opening a port.

  URL layout:
    /api/health         system status (unversioned, for infrastructure)
    /api/v1/...         the REST API the web app uses (coming next)
    /api/openapi.json   machine-readable description of every endpoint
    /api/docs           interactive API docs generated from it
*/

/** Every error response has this shape, so the web app can handle them in one place. */
export type ApiError = { error: { code: string; message: string } }

export function createApp({ db }: { db: Database }) {
  const app = new OpenAPIHono().basePath('/api')

  app.use(requestId()) // X-Request-Id header, handy for matching logs to requests
  app.use(logger())
  app.use(secureHeaders()) // safe defaults: nosniff, frame protection, etc.

  app.route('/', healthRoutes(db))

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Sustainability Hub API', version: '0.1.0' },
  })
  app.get('/docs', Scalar({ url: '/api/openapi.json', pageTitle: 'Sustainability Hub API' }))

  app.notFound((c) =>
    c.json<ApiError>({ error: { code: 'not_found', message: `No endpoint at ${c.req.method} ${c.req.path}` } }, 404),
  )

  // Unexpected errors: log the details on the server, never send them to the
  // client (stack traces can leak internals).
  app.onError((err, c) => {
    console.error(`[${c.get('requestId')}]`, err)
    return c.json<ApiError>({ error: { code: 'internal_error', message: 'Something went wrong' } }, 500)
  })

  return app
}
