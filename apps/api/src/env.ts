import { z } from 'zod'
import { DEV_DATABASE_URL } from '@hub/db'

/*
  All configuration is read and validated here, once, at startup. If something
  is missing or malformed the API stops immediately with a clear message,
  instead of failing later in the middle of a request.

  Development needs no .env file: every value has a default. In production the
  security-relevant values have NO default (database, auth secret, app address,
  mail server), so a misconfigured server refuses to start instead of silently
  using development settings.
*/

/*
  Settings files (Node's built-in loader; real environment variables always win,
  and a value loaded first is never replaced by a later file):
  1. HUB_ENV_FILE, if set: a profile such as .env.supabase (`pnpm dev:supabase`),
     whose values override .env, e.g. another DATABASE_URL
  2. apps/api/.env, if there is one
*/
export const loadedEnvFiles: string[] = []
const profile = process.env.HUB_ENV_FILE
if (profile) {
  try {
    process.loadEnvFile(profile)
    loadedEnvFiles.push(profile)
  } catch {
    console.error(`Can't read ${profile} (HUB_ENV_FILE) in ${process.cwd()}. Copy ${profile}.example to ${profile} and fill it in.`)
    process.exit(1)
  }
}
try {
  process.loadEnvFile()
  loadedEnvFiles.push('.env')
} catch {
  // no .env file: use the environment and the defaults below
}

const isProduction = process.env.NODE_ENV === 'production'

/** Development default, or required in production. */
function devDefault(schema: z.ZodType<string>, developmentValue: string) {
  return isProduction ? schema : schema.default(developmentValue)
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: devDefault(z.url(), DEV_DATABASE_URL),

  /**
   * The database server's CA certificate: a file path (relative to apps/api) or
   * the PEM text itself. Required for Supabase: the connection is encrypted and
   * the server's identity checked. Not needed for the local Docker database.
   */
  DATABASE_CA_CERT: z.string().trim().optional().transform((value) => value || undefined),

  /** Database connections kept open at most. Default 10; lower for small hosted plans. */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  /**
   * The address people use to open the app. Links in emails point here, and
   * only requests coming from this origin may call the auth endpoints.
   * In development that's the app's Vite server, which forwards /api to us.
   */
  APP_URL: devDefault(z.url(), 'http://localhost:5174'),

  /**
   * Signs and encrypts session cookies and email-verification tokens.
   * Production: a long random value, e.g. `openssl rand -base64 48`, kept secret.
   */
  BETTER_AUTH_SECRET: devDefault(
    z.string().min(32, 'must be at least 32 characters'),
    'development-only-secret-never-use-this-in-production',
  ),

  /** Mail server. Development: Mailpit from docker-compose.yml. */
  SMTP_URL: devDefault(z.string().startsWith('smtp'), 'smtp://127.0.0.1:1025'),
  EMAIL_FROM: z.string().default('Sustainability Hub <no-reply@sustainability-hub.local>'),

  /**
   * How many reverse proxies sit in front of the API and add X-Forwarded-For
   * (used to find the real client IP for rate limiting). Development: 1 (the
   * Vite dev server). Production: 0 unless set, e.g. 1 behind an AWS load
   * balancer. Too high a number lets clients fake their IP.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(isProduction ? 0 : 1),

  /**
   * Reject passwords found in known data breaches (Have I Been Pwned). Needs
   * internet access; offline installs can turn it off.
   */
  CHECK_BREACHED_PASSWORDS: z.stringbool().default(true),

  /**
   * "Continue with Google" (optional). Both come from Google Cloud Console
   * (APIs & Services > Credentials > OAuth client ID). Leave both unset to turn
   * Google sign-in off: offline/desktop installs can't use it.
   */
  // Empty values (e.g. a copied .env.example) count as "not set"
  GOOGLE_CLIENT_ID: z.string().trim().optional().transform((value) => value || undefined),
  GOOGLE_CLIENT_SECRET: z.string().trim().optional().transform((value) => value || undefined),
}).refine((value) => Boolean(value.GOOGLE_CLIENT_ID) === Boolean(value.GOOGLE_CLIENT_SECRET), {
  message: 'set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither',
  path: ['GOOGLE_CLIENT_SECRET'],
})

const parsed = EnvSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid API configuration:\n' + z.prettifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env

/** Google sign-in settings, or undefined when it's turned off. */
export const googleOAuth =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
    : undefined
