import { existsSync } from 'node:fs'
import { defineConfig } from 'tsdown'

/*
  Production build: bundles the API, our workspace packages (@hub/db, plain
  TypeScript source) and every third-party package into the self-contained
  dist/ folder: index.mjs plus a few chunks that some libraries load on demand
  (e.g. Better Auth's optional database drivers). It runs with just
  `node dist/index.mjs` and needs no node_modules on the server, which keeps
  Docker images small and is what the desktop installer will package later.

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
