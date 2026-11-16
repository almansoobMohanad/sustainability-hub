import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

/*
  One connection pool per process. A pool keeps a few connections open and
  reuses them, instead of opening a new connection for every query (one of the
  old app's bottlenecks).
*/
export function createDb(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10, // connections kept open at most
    connectionTimeoutMillis: 5_000, // give up if Postgres doesn't answer
    idleTimeoutMillis: 30_000,
  })
  // When Postgres drops a connection that's idle in the pool (restart, failover,
  // network blip), the pool emits 'error'. Without a listener Node treats that as
  // unhandled and crashes the whole API. The pool replaces the broken connection
  // on its own, so logging it is enough.
  pool.on('error', (error) => {
    console.error(`Lost an idle database connection: ${error.message}`)
  })
  // Must match `casing` in drizzle.config.ts
  const db = drizzle({ client: pool, schema, casing: 'snake_case' })
  return { db, pool }
}

export type Database = ReturnType<typeof createDb>['db']
export type DatabasePool = ReturnType<typeof createDb>['pool']
