# Deploying

The live site runs on Vercel (the app plus the API as one function) with its
database on Supabase. **Deploys happen only through GitHub Actions**, after every
check has passed. Vercel's own Git deployments are switched off in `vercel.json`.

## What happens after a merge to `main`

The CI workflow (`.github/workflows/ci.yml`) runs on the merge commit:

1. **Checks**: lint, typecheck, build, migration drift, the Vercel build output.
2. **Tests**: the API tests against a real Postgres.
3. **Docker image and browser tests**: the production image on an empty
   database, then a real browser signs up (with the verification email),
   creates a company, adds and verifies an entry, imports a file and signs in
   (`e2e/`). Browser errors and security-policy blocks fail the tests too.
4. **Deploy to production**, only if 1 to 3 passed:
   1. builds the app and the API function, with the commit id built in;
   2. updates the database (new migrations, emission factor library);
   3. uploads the new version to Vercel **without making it live**;
   4. smoke-tests the new version at its own private address;
   5. makes it live (Vercel's promote API; `vercel promote` fails for this token);
   6. checks that the live address now runs this commit and works.

If anything fails before step 5, the live site keeps running the previous
version and nothing needs undoing. The run's summary page says what happened.

`GET /api/health` reports the running commit as `version`.

## One-time setup

Add these in GitHub: **repository > Settings > Secrets and variables > Actions**.

### Variable (tab "Variables")

| Name | Value |
|---|---|
| `APP_URL` | The live address, e.g. `https://sustainability-hub-zeta.vercel.app` (same as `APP_URL` in Vercel) |

### Secrets (tab "Secrets")

| Name | Where to find it |
|---|---|
| `VERCEL_TOKEN` | vercel.com > your avatar > **Account Settings > Tokens** > Create. Scope: your account (team). Pick an expiry and note the date: deploys stop when it expires. |
| `VERCEL_ORG_ID` | vercel.com > **Team Settings > General > Team ID** (starts with `team_`). |
| `VERCEL_PROJECT_ID` | The project > **Settings > General > Project ID** (starts with `prj_`). |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | The project > **Settings > Deployment Protection > Protection Bypass for Automation** > Add/Generate, then copy it. Lets the pipeline test a new version before it is live (its own address is behind Vercel's login). |
| `MIGRATION_DATABASE_URL` | Supabase's **session pooler** connection string (port 5432), the same value as in Vercel. |
| `DATABASE_CA_CERT` | Supabase's CA certificate (the PEM text), the same value as in Vercel. |

Instead of looking up the two ids, `vercel link` (Vercel CLI) in the repository
writes them to `.vercel/project.json` (`orgId`, `projectId`); that folder is git-ignored.

The deploy job checks all of these first and stops with a list of what's missing.

## If the live site is broken anyway

Vercel > the project > **Deployments** > the previous production deployment >
**Instant Rollback**. Then fix the problem on a branch and merge again; the next
successful deploy makes the new version live as usual.

## Database migrations

Migrations run a moment before the new version goes live, while the previous
version is still answering requests. So a migration must keep the previous
version working: add tables and columns; rename or drop them only in a later
release, once nothing uses them.

## Browser tests on your computer

With `pnpm db:up` and `pnpm dev` running:

```powershell
pnpm e2e
```

It uses the installed Microsoft Edge (nothing to download) and reads the emails
from Mailpit. Test accounts are `e2e.<number>@example.com`; they, their
companies and their emails are deleted at the end (`E2E_KEEP_DATA=1` keeps
them). Sign-up and sign-in are rate limited, so running it several times within
a minute can fail with "Too many attempts": wait a minute.
