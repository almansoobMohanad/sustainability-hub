/*
  Where the public website (apps/site) lives, for "Back to website".
  - Local development: http://localhost:5173 (the default here).
  - Deployed: set VITE_SITE_URL when building the app (see apps/app/.env.example).
*/
export const SITE_URL = import.meta.env.VITE_SITE_URL ?? 'http://localhost:5173/'
