# Credits

Third-party assets used in this project (beyond code dependencies, which are listed in
each `package.json` and are all under permissive licences).

| Asset | Where | Owner and terms |
|---|---|---|
| Google "G" logo | `apps/app/src/features/auth/google-button.tsx` ("Continue with Google" button) | Trademark of Google LLC. Used only on the sign-in button, as required by the [Sign in with Google branding guidelines](https://developers.google.com/identity/branding-guidelines). |
| Geist font | `packages/ui` (via `@fontsource-variable/geist`) | Vercel, [SIL Open Font License 1.1](https://github.com/vercel/geist-font/blob/main/LICENSE.TXT) |
| UK Government GHG Conversion Factors for Company Reporting, 2019 to 2026 | `packages/db/seed/uk-ghg/` (converted from the official flat-format spreadsheets by `packages/db/scripts/import-uk-factors.mjs`; only the total kg CO2e factors, with source names unified across years) | Contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). © Crown copyright, Department for Energy Security and Net Zero (DESNZ) / Defra. Source: [gov.uk conversion factors](https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting). |

Everything else visual (for example the animated leaf on the landing page) is original and
generated in code.
