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

// Load apps/api/.env if there is one (Node's built-in loader; real environment
// variables still win over the file).
try {
  process.loadEnvFile()
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
})

const parsed = EnvSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid API configuration:\n' + z.prettifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
