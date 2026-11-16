import { defineConfig } from 'drizzle-kit'
import { DEV_DATABASE_URL } from './src/dev-database-url'

/*
  drizzle-kit reads this file. Workflow when the schema changes:
    1. edit src/schema/*.ts
    2. pnpm db:generate   -> writes a new SQL file to migrations/ (commit it)
    3. restart the API    -> it applies new migrations automatically on startup
  `pnpm db:studio` opens a browser UI for looking at the data.
*/
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? DEV_DATABASE_URL,
  },
  // TypeScript fields are camelCase, database columns are snake_case
  // (createdAt -> created_at). Must match `casing` in src/client.ts.
  casing: 'snake_case',
  strict: true,
  verbose: true,
})
