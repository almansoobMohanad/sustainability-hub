import { getRequestListener } from '@hono/node-server'
import { waitUntil } from '@vercel/functions'
import { attachDatabasePool } from '@vercel/functions/db-connections'
import { createDb } from '@hub/db'
import { createApp } from './app'
import { createAuth } from './auth/auth'
import { createSmtpMailer, keepAliveWhileSending } from './email/mailer'
import { databaseConfigProblem, databaseLabel, describeDatabase, readCaCertificate } from './database-config'
import { env, googleOAuth } from './env'

/*
  The API as a Vercel function (the Docker image and `pnpm dev` use index.ts).
  Vercel starts an instance when requests come in, may run several at once and
  stops them when it's quiet, so compared with index.ts:
  - No migrations or factor library load here: they run once per deploy, in the
    build (tools/migrate.ts), not every time an instance starts.
  - Few database connections per instance (default 3), through Supabase's
    transaction pooler, which shares them between all instances.
  - Emails are sent in the background as usual, but Vercel is told to keep the
    instance running until they're out (waitUntil).
  - The client address for rate limits comes from x-real-ip, which Vercel's
    edge sets itself (whatever the browser sent).
  Built by `pnpm --filter @hub/api build:vercel`, packaged by tools/vercel-output.ts.
*/

// Plain request logs (Vercel's log viewer would show colour codes as text)
process.env.NO_COLOR ??= '1'

const target = describeDatabase(env.DATABASE_URL)
const caCertificate = readCaCertificate(env.DATABASE_CA_CERT)
const problem = databaseConfigProblem(target, { hasCaCertificate: Boolean(caCertificate), serverless: true })
if (problem) throw new Error(`Invalid API configuration: ${problem}`)
console.log(`Database: ${databaseLabel(target)}${caCertificate ? ', SSL with certificate check' : ''}`)

const { db, pool } = createDb(env.DATABASE_URL, {
  caCertificate,
  // env.ts's default (10) is for one long-running server; an instance here handles far less
  maxConnections: process.env.DATABASE_POOL_MAX ? env.DATABASE_POOL_MAX : 3,
})
// Closes idle connections before Vercel freezes a quiet instance, so they don't pile up at the pooler
attachDatabasePool(pool)

const mailer = keepAliveWhileSending(createSmtpMailer({ url: env.SMTP_URL, from: env.EMAIL_FROM }), waitUntil)
const auth = createAuth({
  db,
  mailer,
  appUrl: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  checkBreachedPasswords: env.CHECK_BREACHED_PASSWORDS,
  google: googleOAuth,
})

const app = createApp({
  db,
  auth,
  trustedProxyHops: env.TRUST_PROXY_HOPS,
  clientIpHeader: env.CLIENT_IP_HEADER ?? 'x-real-ip',
  googleSignIn: Boolean(googleOAuth),
})

// Vercel's Node.js launcher calls this with Node's request and response
export default getRequestListener(app.fetch)
