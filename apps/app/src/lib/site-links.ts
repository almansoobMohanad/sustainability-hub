/*
  Where the public website (apps/site) lives, for "Back to website".
  - Local development: http://localhost:5173 (the default here).
  - Deployed: set VITE_SITE_URL when building the app (see apps/app/.env.example).
    A production build without it has NO website link (null) rather than one
    pointing at localhost, e.g. while only the app is online.
*/
export const SITE_URL: string | null = import.meta.env.VITE_SITE_URL || (import.meta.env.DEV ? 'http://localhost:5173/' : null)
