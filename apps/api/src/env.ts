import { z } from 'zod'
import { DEV_DATABASE_URL } from '@hub/db'

/*
  All configuration is read and validated here, once, at startup. If something
  is missing or malformed the API stops immediately with a clear message,
  instead of failing later in the middle of a request.

  Development needs no .env file: every value has a default. In production,
  DATABASE_URL is required (no default), so a misconfigured server can never
  silently connect to the development database.
*/

// Load apps/api/.env if there is one (Node's built-in loader; real environment
// variables still win over the file).
try {
  process.loadEnvFile()
} catch {
  // no .env file: use the environment and the defaults below
}

const isProduction = process.env.NODE_ENV === 'production'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: isProduction ? z.url() : z.url().default(DEV_DATABASE_URL),
})

const parsed = EnvSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid API configuration:\n' + z.prettifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
