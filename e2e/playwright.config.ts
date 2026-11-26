import { defineConfig } from '@playwright/test'
import { ACCOUNT_STATE, APP_URL } from './support/settings'

/*
  End-to-end tests: a real browser goes through the product like a person
  would (sign up, company, entries, import), against a running app.

  - Locally: `pnpm db:up` + `pnpm dev`, then `pnpm e2e` (uses the installed
    Microsoft Edge, nothing to download). Emails are read from Mailpit.
  - In CI: the production Docker image on an empty database, with Mailpit
    (.github/workflows/ci.yml, job "Docker image and browser tests"), using the
    runner's Google Chrome.

  One account is created per run ("setup"), and the tests use it one after
  another (workers: 1): sign-up is rate limited per address (3 per minute).
*/

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  globalTeardown: './support/cleanup.ts',
  use: {
    baseURL: APP_URL,
    // The browser that's already installed: Edge on Windows, Chrome on the CI runner
    channel: process.env.E2E_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chrome'),
    viewport: { width: 1536, height: 864 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /account\.setup\.ts/ },
    { name: 'app', testMatch: /\.spec\.ts/, dependencies: ['setup'], use: { storageState: ACCOUNT_STATE } },
  ],
})
