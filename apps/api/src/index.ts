import { serve } from '@hono/node-server'
import { createDb, runMigrations } from '@hub/db'
import { createApp } from './app'
import { env } from './env'
import { waitForDatabase } from './wait-for-database'

/*
  API entry point. Startup order:
    1. read + validate configuration (env.ts, on import)
    2. wait until Postgres answers
    3. apply new database migrations (no manual setup steps, ever)
    4. start listening for requests
*/

const { db, pool } = createDb(env.DATABASE_URL)

await waitForDatabase(pool, { timeoutMs: env.NODE_ENV === 'production' ? 60_000 : Infinity })

const migrations = await runMigrations(db)
console.log(migrations.applied ? 'Database migrations are up to date.' : 'No database migrations yet.')

const app = createApp({ db })

const server = serve({ fetch: app.fetch, hostname: env.HOST, port: env.PORT }, (info) => {
  console.log(`API listening on http://${info.address}:${info.port}  (docs: /api/docs)`)
})

// Stop cleanly (Ctrl+C, Docker/ECS stop, tsx restarting on a file change):
// finish in-flight requests, then close the database connections.
function shutdown() {
  server.close(() => {
    void pool.end().finally(() => process.exit(0))
  })
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
