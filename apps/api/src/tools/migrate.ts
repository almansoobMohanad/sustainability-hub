import { createDb, loadFactorLibrary, runMigrations } from '@hub/db'
import { databaseConfigProblem, databaseLabel, describeDatabase, readCaCertificate, unreachableHint } from '../database-config'
import { checkSectorTemplates } from '../factors/sector-templates'
import { waitForDatabase } from '../wait-for-database'

/*
  Brings the database up to date: new migrations, then the emission factor
  library (only years that are new or changed). The long-running server
  (index.ts) does this itself at startup; on Vercel it runs once per production
  deploy, at the end of the build (`pnpm --filter @hub/api db:deploy`), so a
  failure stops the deploy and the previous version stays live.

  Settings (environment variables):
    MIGRATION_DATABASE_URL  Supabase's SESSION pooler (port 5432); migrations need
                            one connection for the whole run. Falls back to
                            DATABASE_URL (fine for local and Docker databases).
    DATABASE_CA_CERT        as for the API

  New migrations must keep the previous version working (add, don't rename or
  drop in the same release): they're applied a moment before the new version
  takes over, and the old one may still be answering requests.
*/

// On Vercel, only production builds touch the database. Previews would otherwise
// apply a branch's unmerged migrations to the live database.
if (process.env.VERCEL && process.env.VERCEL_ENV !== 'production') {
  console.log(`Database migrations skipped: this is a ${process.env.VERCEL_ENV ?? 'unknown'} build, not production.`)
  process.exit(0)
}

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL
if (!url) {
  console.error('Set MIGRATION_DATABASE_URL (Supabase: the session pooler string, port 5432) or DATABASE_URL.')
  process.exit(1)
}

const target = describeDatabase(url)
let caCertificate: string | undefined
try {
  caCertificate = readCaCertificate(process.env.DATABASE_CA_CERT?.trim() || undefined)
} catch (error) {
  console.error((error as Error).message)
  process.exit(1)
}
// Not serverless: the transaction pooler is refused here, as for the long-running server
const problem = databaseConfigProblem(target, { hasCaCertificate: Boolean(caCertificate) })
if (problem) {
  console.error(problem.replace('DATABASE_URL', process.env.MIGRATION_DATABASE_URL ? 'MIGRATION_DATABASE_URL' : 'DATABASE_URL'))
  process.exit(1)
}
console.log(`Database: ${databaseLabel(target)}${caCertificate ? ', SSL with certificate check' : ''}`)

const { db, pool } = createDb(url, { caCertificate, maxConnections: 2 })
try {
  await waitForDatabase(pool, { timeoutMs: 30_000, hint: unreachableHint(target) })

  const migrations = await runMigrations(db)
  console.log(migrations.applied ? 'Database migrations are up to date.' : 'No database migrations yet.')

  const started = Date.now()
  const library = await loadFactorLibrary(db)
  if (!library.loaded) throw new Error(`Emission factor library NOT loaded: ${library.reason}`)
  if (library.reloadedYears.length > 0 || library.sourcesReloaded) {
    console.log(`Emission factor library loaded: UK ${library.reloadedYears.join(', ') || '(sources only)'} in ${Date.now() - started} ms.`)
  } else {
    console.log(`Emission factor library is up to date (UK ${library.years[0]}-${library.years.at(-1)}).`)
  }
  await checkSectorTemplates(db)
} catch (error) {
  console.error('Database update failed:', error)
  process.exitCode = 1
} finally {
  await pool.end()
}
