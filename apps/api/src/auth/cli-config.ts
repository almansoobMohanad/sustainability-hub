import { createDb, DEV_DATABASE_URL } from '@hub/db'
import { createAuth } from './auth'

/*
  Only for Better Auth's CLI (`pnpm --filter @hub/api auth:schema`), which reads
  this file to generate the auth tables in packages/db/src/schema/auth.ts.
  Re-run it after adding Better Auth plugins that need new tables, then
  `pnpm db:generate` for the migration. Not used by the running API (no
  connection is opened and no email is sent from here).
*/
export const auth = createAuth({
  db: createDb(DEV_DATABASE_URL).db,
  mailer: { send: async () => {} },
  appUrl: 'http://localhost:5174',
  secret: 'cli-only-secret-used-for-schema-generation',
  checkBreachedPasswords: true,
})
