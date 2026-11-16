/*
  Where the product app (apps/app) lives. The site and the app are separate
  apps on separate addresses, so links between them are full URLs.

  - Local development: the app runs on http://localhost:5174 (the default here).
  - Deployed: set VITE_APP_URL when building the site, e.g.
    VITE_APP_URL=https://app.example.com/ (see apps/site/.env.example).
*/
export const APP_URL = import.meta.env.VITE_APP_URL ?? 'http://localhost:5174/'

/** Where "Get started" goes: the app's sign-up page. */
export const GET_STARTED_URL = new URL('sign-up', APP_URL).href
