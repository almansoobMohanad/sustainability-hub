import type { DatabasePool } from '@hub/db'

/*
  On startup the database may not be ready yet (Docker still starting, the PC
  just booted). Instead of crashing, keep trying and explain what to do.
  - development: wait as long as it takes (start Docker and the API carries on)
  - production: give up after `timeoutMs` so the platform restarts the container
*/
export async function waitForDatabase(pool: DatabasePool, { timeoutMs }: { timeoutMs: number }) {
  const started = Date.now()
  let warned = false
  for (;;) {
    try {
      await pool.query('select 1')
      if (warned) console.log('Database is up.')
      return
    } catch (error) {
      if (Date.now() - started > timeoutMs) throw error
      if (!warned) {
        warned = true
        console.warn(
          `Can't reach Postgres (${(error as Error).message || 'connection refused'}).\n` +
            'Is it running? Start it with:  pnpm db:up   (Docker Desktop must be open)\n' +
            'Waiting for the database...',
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000))
    }
  }
}
