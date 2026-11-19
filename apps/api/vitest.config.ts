import { defineConfig } from 'vitest/config'

/*
  API tests: the real app (createApp) against a real Postgres. The global setup
  creates a separate, empty test database for every run (never the development
  one) and loads the migrations and the factor library into it. See test/README.md.
*/
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    // Each test file signs people up and creates companies; scrypt password
    // hashing makes that a few hundred ms per person.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
