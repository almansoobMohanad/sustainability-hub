/*
  Which version of the code is running: the git commit it was built from, or
  null for a development server or a build that wasn't given one.

  Builds set HUB_VERSION (the deploy pipeline uses the commit id), and both
  tsdown configs write it into the bundle (`define`), so it doesn't depend on
  the host's settings. /api/health reports it; the deploy pipeline checks that
  the address it tested really serves the commit it just built.
*/
export const APP_VERSION: string | null = process.env.HUB_VERSION || null
