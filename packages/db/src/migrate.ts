import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { Database } from './client'

/*
  Applies any migrations that haven't run yet. The API calls this on startup,
  so nobody ever runs setup scripts by hand (a key requirement for the desktop
  installer). Drizzle records applied migrations in the
  drizzle.__drizzle_migrations table, so running it again is harmless, and it
  takes a database lock so two API instances starting together don't collide.
*/

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Where the migration files are:
 * - running from source (development): packages/db/migrations
 * - running the bundled API (apps/api/dist): copied next to the bundle at build time
 */
function findMigrationsFolder() {
  const candidates = [join(here, '../migrations'), join(here, 'migrations')]
  return candidates.find((dir) => existsSync(join(dir, 'meta/_journal.json')))
}

export async function runMigrations(db: Database) {
  const migrationsFolder = findMigrationsFolder()
  if (!migrationsFolder) {
    // No migrations generated yet (the schema is still empty)
    return { applied: false as const }
  }
  await migrate(db, { migrationsFolder })
  return { applied: true as const, migrationsFolder }
}
