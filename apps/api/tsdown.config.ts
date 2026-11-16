import { existsSync } from 'node:fs'
import { defineConfig } from 'tsdown'

/*
  Production build: bundles the API, our workspace packages (@hub/db, plain
  TypeScript source) and every third-party package into ONE self-contained file,
  dist/index.mjs. It runs with just `node dist/index.mjs` and needs no
  node_modules on the server, which keeps Docker images small and is what the
  desktop installer will package later.

  Database migrations are copied next to the bundle so it can migrate on startup.
*/
const MIGRATIONS = '../../packages/db/migrations'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  deps: {
    alwaysBundle: [/./], // bundle everything
    onlyBundle: false, // and don't print the list of bundled packages
  },
  // The folder only exists once the first migration has been generated
  copy: existsSync(MIGRATIONS) ? [{ from: MIGRATIONS, to: 'dist' }] : [],
})
