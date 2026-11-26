import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/*
  Where the app and its email inbox are, and the account a run creates.
    E2E_BASE_URL     the app (default: the dev server, http://localhost:5174)
    E2E_MAILPIT_URL  Mailpit, which receives the app's emails (default: docker-compose's)
*/
export const APP_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5174'
export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:8025'

const here = dirname(fileURLToPath(import.meta.url))
// Written by the setup test, read by the others (git-ignored)
const STATE_DIR = join(here, '..', '.auth')
export const ACCOUNT_STATE = join(STATE_DIR, 'session.json')
const ACCOUNT_FILE = join(STATE_DIR, 'account.json')

/** Test accounts look like e2e.<time>@example.com: cleanup deletes exactly these */
export const TEST_EMAIL_PATTERN = 'e2e.%@example.com'

export type Account = { name: string; email: string; password: string; company: string }

export function newAccount(): Account {
  const run = Date.now()
  return {
    name: 'E2E Tester',
    email: `e2e.${run}@example.com`,
    password: `a long test passphrase ${run}`,
    company: `E2E Test Company ${run}`,
  }
}

export function saveAccount(account: Account) {
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(ACCOUNT_FILE, JSON.stringify(account, null, 2))
}

export function savedAccount(): Account {
  return JSON.parse(readFileSync(ACCOUNT_FILE, 'utf8')) as Account
}

/** "YYYY-MM", months back from now (UTC, like the API's latest reportable month) */
export function month(monthsBack = 0) {
  const now = new Date()
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1))
  return date.toISOString().slice(0, 7)
}
