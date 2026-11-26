import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { sql, type Database } from '@hub/db'
import { APP_VERSION } from '../version'

/*
  GET /api/health
  Used by load balancers (AWS), Docker health checks and the desktop app to ask
  "is the API up, and can it reach the database?". Returns 503 when the database
  is unreachable so infrastructure can react (e.g. stop sending traffic).
*/

const HealthSchema = z
  .object({
    status: z.enum(['ok', 'unavailable']).openapi({ example: 'ok' }),
    database: z.enum(['up', 'down']).openapi({ example: 'up' }),
    uptimeSeconds: z.number().int().openapi({ example: 42 }),
    version: z.string().nullable().openapi({
      example: '1a23631f0c4e8a9d2b7e5f3c6a1d4b8e9f0a2c3d',
      description: 'The git commit this server was built from (null in development)',
    }),
  })
  .openapi('Health')

const route = createRoute({
  method: 'get',
  path: '/health',
  tags: ['System'],
  summary: 'Check that the API and its database are up',
  responses: {
    200: {
      description: 'The API and the database are up',
      content: { 'application/json': { schema: HealthSchema } },
    },
    503: {
      description: 'The API is running but cannot reach the database',
      content: { 'application/json': { schema: HealthSchema } },
    },
  },
})

export function healthRoutes(db: Database) {
  return new OpenAPIHono().openapi(route, async (c) => {
    const uptimeSeconds = Math.round(process.uptime())
    const version = APP_VERSION
    try {
      await db.execute(sql`select 1`)
      return c.json({ status: 'ok' as const, database: 'up' as const, uptimeSeconds, version }, 200)
    } catch {
      return c.json({ status: 'unavailable' as const, database: 'down' as const, uptimeSeconds, version }, 503)
    }
  })
}
