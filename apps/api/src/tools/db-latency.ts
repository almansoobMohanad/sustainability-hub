import { performance } from 'node:perf_hooks'
import { createDb } from '@hub/db'
import { databaseConfigProblem, databaseLabel, describeDatabase, readCaCertificate } from '../database-config'
import { env, loadedEnvFiles } from '../env'

/*
  How long one trip to the database takes from THIS computer:
    pnpm db:latency             the local Docker database
    pnpm db:latency:supabase    Supabase (apps/api/.env.supabase)

  Every query is at least one round trip, and a request makes several in a
  row (session check, company check, the data), so this is the floor of every
  API response. From a laptop to Supabase it measures the internet in between;
  a deployed API in the same region as the database is far closer.
*/

const target = describeDatabase(env.DATABASE_URL)
const caCertificate = readCaCertificate(env.DATABASE_CA_CERT)
const problem = databaseConfigProblem(target, { hasCaCertificate: Boolean(caCertificate) })
if (problem) {
  console.error(problem)
  process.exit(1)
}
console.log(`Database: ${databaseLabel(target)}${loadedEnvFiles.length ? `  [settings: ${loadedEnvFiles.join(' + ')}]` : ''}`)

const { pool } = createDb(env.DATABASE_URL, { caCertificate, maxConnections: 1 })

async function time(sql: string) {
  const started = performance.now()
  await pool.query(sql)
  return performance.now() - started
}

function summary(label: string, samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  console.log(
    `${label.padEnd(34)} median ${median.toFixed(1)} ms  (min ${sorted[0].toFixed(1)}, max ${sorted.at(-1)!.toFixed(1)})`,
  )
  return median
}

try {
  const connectStarted = performance.now()
  await pool.query('select 1') // opens the connection (TLS handshake for hosted databases)
  console.log(`${'First connection'.padEnd(34)} ${(performance.now() - connectStarted).toFixed(1)} ms`)

  const roundTrip = summary('Round trip (select 1), 20x', await sequence(20, () => time('select 1')))
  // A new database has no tables until the API has started once (it runs the migrations then)
  const { rows } = await pool.query<{ ready: boolean }>("select to_regclass('public.emission_sources') is not null as ready")
  if (rows[0]?.ready) {
    summary(
      'Library search (indexed), 10x',
      await sequence(10, () => time("select count(*) from emission_sources where search_text like '%diesel%'")),
    )
  } else {
    console.log(`${'Library search'.padEnd(34)} skipped: no tables yet (start the API once to create them)`)
  }
  console.log(
    `\nA request with 4 queries in a row waits about ${(roundTrip * 4).toFixed(0)} ms for the database from here.`,
  )
} catch (error) {
  console.error(`Couldn't measure: ${(error as Error).message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}

async function sequence(times: number, run: () => Promise<number>) {
  const samples: number[] = []
  for (let i = 0; i < times; i++) samples.push(await run())
  return samples
}
