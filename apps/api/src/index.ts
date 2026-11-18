import { serve } from '@hono/node-server'
import { createDb, loadFactorLibrary, runMigrations } from '@hub/db'
import { createApp } from './app'
import { createAuth } from './auth/auth'
import { createSmtpMailer } from './email/mailer'
import { env, googleOAuth } from './env'
import { checkSectorTemplates } from './factors/sector-templates'
import { waitForDatabase } from './wait-for-database'

/*
  API entry point. Startup order:
    1. read + validate configuration (env.ts, on import)
    2. wait until Postgres answers
    3. apply new database migrations (no manual setup steps, ever)
    4. load the emission factor library (only years that are new or changed)
    5. start listening for requests
*/

const { db, pool } = createDb(env.DATABASE_URL)

await waitForDatabase(pool, { timeoutMs: env.NODE_ENV === 'production' ? 60_000 : Infinity })

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

const app = createApp({ db, auth, trustedProxyHops: env.TRUST_PROXY_HOPS, googleSignIn: Boolean(googleOAuth) })

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
