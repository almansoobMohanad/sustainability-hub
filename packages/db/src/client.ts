import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

export type DatabaseOptions = {
  /**
   * The server's CA certificate (PEM text). When given, the connection is
   * encrypted AND the server's identity is checked against it (hosted
   * databases such as Supabase). Without it, the connection string decides
   * (the local Docker database uses no SSL).
   */
  caCertificate?: string
  /** Connections kept open at most (default 10). Hosted free plans allow only a few. */
  maxConnections?: number
}

/** SSL settings in a connection string; they would replace our certificate setting */
const SSL_PARAMETERS = ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl', 'uselibpqcompat']

/*
  One connection pool per process. A pool keeps a few connections open and
  reuses them, instead of opening a new connection for every query (one of the
  old app's bottlenecks).
*/
export function createDb(connectionString: string, { caCertificate, maxConnections = 10 }: DatabaseOptions = {}) {
  let url = connectionString
  if (caCertificate) {
    // node-postgres lets SSL settings in the URL override the `ssl` option (and
    // treats sslmode=require as "verify against the system's CAs", which a
    // database's own CA isn't one of), so the certificate decides alone.
    const parsed = new URL(connectionString)
    for (const name of SSL_PARAMETERS) parsed.searchParams.delete(name)
    url = parsed.toString()
  }

  const pool = new Pool({
    connectionString: url,
    max: maxConnections,
    connectionTimeoutMillis: 10_000, // give up if Postgres doesn't answer (hosted databases are further away)
    idleTimeoutMillis: 30_000,
    // Encrypted, and only to a server whose certificate is signed by this CA (never rejectUnauthorized: false)
    ssl: caCertificate ? { ca: caCertificate, rejectUnauthorized: true } : undefined,
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
