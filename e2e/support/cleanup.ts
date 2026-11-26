import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { deleteTestEmails } from './mailpit'
import { APP_URL, TEST_EMAIL_PATTERN } from './settings'

/*
  After a run against the LOCAL dev setup: deletes the test accounts, their
  companies (with everything in them) and their emails, so the dev database
  doesn't fill up with test data. Set E2E_KEEP_DATA=1 to look at it afterwards.

  Only for the docker-compose database (it goes through `docker compose exec`,
  so it can't reach any other database). In CI the database is thrown away.
  A company is deleted only when ALL its members are test accounts.
*/
const SQL = `
  delete from organizations o
   where exists (select 1 from members m join users u on u.id = m.user_id
                  where m.organization_id = o.id and u.email like '${TEST_EMAIL_PATTERN}')
     and not exists (select 1 from members m join users u on u.id = m.user_id
                      where m.organization_id = o.id and u.email not like '${TEST_EMAIL_PATTERN}');
  delete from users where email like '${TEST_EMAIL_PATTERN}';
`

export default async function cleanup() {
  if (process.env.CI || process.env.E2E_KEEP_DATA === '1') return
  const host = new URL(APP_URL).hostname
  if (host !== 'localhost' && host !== '127.0.0.1') return

  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  try {
    const { stdout: output } = await promisify(execFile)(
      'docker',
      ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'hub', '-d', 'sustainability_hub', '-v', 'ON_ERROR_STOP=1', '-c', SQL],
      { cwd: repoRoot, encoding: 'utf8' },
    )
    const deleted = output.match(/DELETE \d+/g)?.join(', ') ?? 'nothing'
    console.log(`Cleanup: test data deleted (companies, users: ${deleted}), ${await deleteTestEmails()} test emails deleted.`)
  } catch (error) {
    console.warn(`Cleanup skipped: ${(error as Error).message.split('\n')[0]}`)
  }
}
