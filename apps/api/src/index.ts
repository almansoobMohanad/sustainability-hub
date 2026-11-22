import { serve } from '@hono/node-server'
import { createDb, loadFactorLibrary, runMigrations } from '@hub/db'
import { createApp } from './app'
import { createAuth } from './auth/auth'
import { createSmtpMailer } from './email/mailer'
import { databaseConfigProblem, databaseLabel, describeDatabase, readCaCertificate, unreachableHint } from './database-config'
import { env, googleOAuth, loadedEnvFiles } from './env'
import { checkSectorTemplates } from './factors/sector-templates'
import { waitForDatabase } from './wait-for-database'

/*
  API entry point. Startup order:
    1. read + validate configuration (env.ts, on import); say which database it is
    2. wait until Postgres answers
    3. apply new database migrations (no manual setup steps, ever)
    4. load the emission factor library (only years that are new or changed)
    5. start listening for requests
*/

// Which database, said plainly (local Docker or Supabase), so data never goes to the wrong one by surprise
const target = describeDatabase(env.DATABASE_URL)
let caCertificate: string | undefined
try {
  caCertificate = readCaCertificate(env.DATABASE_CA_CERT)
} catch (error) {
  console.error(`Invalid API configuration: ${(error as Error).message}`)
  process.exit(1)
}
const problem = databaseConfigProblem(target, { hasCaCertificate: Boolean(caCertificate) })
if (problem) {
  console.error(`Invalid API configuration: ${problem}`)
  process.exit(1)
}
console.log(
  `Database: ${databaseLabel(target)}${caCertificate ? ', SSL with certificate check' : ''}` +
    (loadedEnvFiles.length ? `  [settings: ${loadedEnvFiles.join(' + ')}]` : ''),
)

const { db, pool } = createDb(env.DATABASE_URL, { caCertificate, maxConnections: env.DATABASE_POOL_MAX })

await waitForDatabase(pool, {
  timeoutMs: env.NODE_ENV === 'production' ? 60_000 : Infinity,
  hint: unreachableHint(target),
})

const migrations = await runMigrations(db)
console.log(migrations.applied ? 'Database migrations are up to date.' : 'No database migrations yet.')

const startedLoading = Date.now()
const library = await loadFactorLibrary(db)
if (!library.loaded) {
  console.warn(`Emission factor library NOT loaded: ${library.reason}.`)
} else if (library.reloadedYears.length > 0 || library.sourcesReloaded) {
  console.log(
    `Emission factor library loaded: UK ${library.reloadedYears.join(', ') || '(sources only)'} in ${Date.now() - startedLoading} ms.`,
  )
} else {
  console.log(`Emission factor library is up to date (UK ${library.years[0]}-${library.years.at(-1)}).`)
}
if (library.loaded) await checkSectorTemplates(db)

const mailer = createSmtpMailer({ url: env.SMTP_URL, from: env.EMAIL_FROM })
const auth = createAuth({
  db,
  mailer,
  appUrl: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  checkBreachedPasswords: env.CHECK_BREACHED_PASSWORDS,
  google: googleOAuth,
})
console.log(googleOAuth ? 'Google sign-in: on.' : 'Google sign-in: off (no GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).')

let app: ReturnType<typeof createApp>
try {
  app = createApp({
    db,
    auth,
    trustedProxyHops: env.TRUST_PROXY_HOPS,
    clientIpHeader: env.CLIENT_IP_HEADER,
    appFiles: env.APP_FILES_DIR ? { dir: env.APP_FILES_DIR, appUrl: env.APP_URL } : undefined,
    googleSignIn: Boolean(googleOAuth),
  })
} catch (error) {
  console.error(`Invalid API configuration: ${(error as Error).message}`)
  process.exit(1)
}
if (env.APP_FILES_DIR) console.log(`Serving the app from ${env.APP_FILES_DIR}`)

const server = serve({ fetch: app.fetch, hostname: env.HOST, port: env.PORT }, (info) => {
  console.log(`API listening on http://${info.address}:${info.port}  (docs: /api/docs)${env.APP_FILES_DIR ? ', app: /' : ''}`)
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
