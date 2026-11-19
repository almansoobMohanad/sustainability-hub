# API tests

These run the real API (`createApp` with Better Auth) against a real Postgres, in-process: no port and no browser.

```powershell
pnpm db:up                         # Postgres in Docker (once)
pnpm --filter @hub/api test        # these tests (about 10 s)
pnpm test                          # every package's tests (via Turbo)
```

- **The database**: every run drops and re-creates `sustainability_hub_test` on the same Postgres as development, then applies all migrations and loads the factor library. Your development data is never touched: the setup refuses any database whose name doesn't end in `_test`. CI sets `TEST_DATABASE_URL` to a Postgres service container.
- **People**: `signUp(api)` signs someone up and follows the verification link from the fake mailer, which keeps emails in memory (`api.emails`, `api.emailTo(...)`). `createCompany` and `addMember` build companies with roles through the real endpoints.
- **Rate limits** are on, as in production. Each `Person` has its own client IP, so tests don't share limits.
- **Files**: `auth`, `companies`, `factor-library` and `emissions`, one per area. Add new endpoints' rules to the matching file, or start a new `<area>.test.ts`.
