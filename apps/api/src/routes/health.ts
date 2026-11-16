import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { sql, type Database } from '@hub/db'

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
    try {
      await db.execute(sql`select 1`)
      return c.json({ status: 'ok' as const, database: 'up' as const, uptimeSeconds }, 200)
    } catch {
      return c.json({ status: 'unavailable' as const, database: 'down' as const, uptimeSeconds }, 503)
    }
  })
}
