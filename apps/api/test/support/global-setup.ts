import type { TestProject } from 'vitest/node'
import { createDb, DEV_DATABASE_URL, loadFactorLibrary, runMigrations } from '@hub/db'

/*
  Runs once before all test files:
    1. drop and re-create the TEST database (a fresh start every run)
    2. apply every migration, exactly as the API does at startup
    3. load the emission factor library (all years)
  Test files then get the database address through inject('databaseUrl').

  Which database: TEST_DATABASE_URL (CI sets it), otherwise the development
  database's address with "_test" added to the name, on the same Postgres from
  docker-compose (`pnpm db:up`). The name MUST end in "_test": this file drops
  that database, so it refuses to touch anything else.
*/

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}

function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return new URL(process.env.TEST_DATABASE_URL)
  const url = new URL(DEV_DATABASE_URL)
  url.pathname = `${url.pathname}_test`
  return url
}

export default async function setup(project: TestProject) {
  const url = testDatabaseUrl()
  const name = decodeURIComponent(url.pathname.slice(1))
  // Also makes the name safe to put into the SQL below
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(`The test database name must end in "_test" (got "${name}"). It is dropped on every run.`)
  }

  // CREATE/DROP DATABASE can't run inside the database itself: use "postgres"
  const maintenance = new URL(url)
  maintenance.pathname = '/postgres'
  const admin = createDb(maintenance.href)
  try {
    await admin.pool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    await admin.pool.query(`CREATE DATABASE "${name}"`)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ECONNREFUSED') {
      throw new Error(`Postgres is not running at ${url.host}. Start it with \`pnpm db:up\` (Docker Desktop must be open).`, {
        cause: error,
      })
    }
    throw error
  } finally {
    await admin.pool.end()
  }

  const { db, pool } = createDb(url.href)
  try {
    await runMigrations(db)
    const library = await loadFactorLibrary(db)
    if (!library.loaded) throw new Error(`The factor library did not load: ${library.reason}`)
  } finally {
    await pool.end()
  }

  project.provide('databaseUrl', url.href)
}
