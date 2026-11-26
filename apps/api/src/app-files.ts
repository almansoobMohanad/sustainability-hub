import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import type { Context, Hono, MiddlewareHandler } from 'hono'

/*
  Serves the built product app (apps/app/dist) from the API, so one server and
  one address hold both: the app and /api share an origin (cookies stay
  first-party, no CORS), and the same setup works in Docker and the desktop
  version later. In development the app's Vite server does this instead.

  - /assets/*  code, styles and fonts. Their file names contain a hash of their
    content, so a new version always has new names: browsers may keep them for
    a year without asking again. A missing one is a plain 404, never the app's
    page (a page still open from the previous version would otherwise get HTML
    where it expects code; the app reloads itself instead, see main.tsx).
  - other files (favicon.svg): cached for an hour.
  - any other GET (/, /emissions, /settings/sources, ...): index.html, so links
    and reloads work for every page of the app; the router picks the page. It
    is never cached, so people get the new version right after a deploy.

  Files ending in .br/.gz next to the original (written at build time by
  scripts/precompress.mjs) are sent to browsers that accept them.
*/

const YEAR = 365 * 24 * 60 * 60

export function serveAppFiles(app: Hono, { dir, contentSecurityPolicy }: { dir: string; contentSecurityPolicy: string }) {
  const root = resolve(dir)
  const indexFile = join(root, 'index.html')
  if (!existsSync(indexFile)) throw new Error(`APP_FILES_DIR: no index.html in ${root} (build the app first)`)
  // Small and asked for on every visit: read once
  const indexHtml = readFileSync(indexFile, 'utf8')

  app.use('/assets/*', cacheFor(`public, max-age=${YEAR}, immutable`), serveStatic({ root, precompressed: true }))
  app.get('/assets/*', (c) => c.text('Not found', 404))

  // The app's page, for every address that isn't a file (the router picks the page)
  const page = (c: Context) => {
    // Unknown API addresses stay JSON 404s (the API's notFound), never the app's page
    if (c.req.path === '/api' || c.req.path.startsWith('/api/')) return c.notFound()
    c.header('Cache-Control', 'no-cache')
    c.header('Content-Security-Policy', contentSecurityPolicy)
    return c.html(indexHtml)
  }
  app.get('/', page)
  app.get('/index.html', page)
  app.use('*', cacheFor('public, max-age=3600'), serveStatic({ root, precompressed: true }))
  app.get('*', page)
}

/**
 * Cache-Control for files that were found (serveStatic's onFound runs too late
 * to add headers). Leaves answers that chose their own alone (the app's page).
 */
function cacheFor(value: string): MiddlewareHandler {
  return async (c, next) => {
    await next()
    const found = c.res.status === 200 || c.res.status === 206
    if (found && !c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', value)
  }
}

/**
 * What the app's pages may load. Everything comes from our own server except
 * profile photos from Google sign-in. No inline or eval'd scripts (the main
 * defence if someone ever manages to inject HTML); inline styles are allowed
 * because UI components set positions and sizes with them.
 *
 * Two allowances for the PDF reports (@react-pdf/renderer, built in the
 * browser): its layout engine is WebAssembly that it loads from a data: URL
 * with fetch, so 'wasm-unsafe-eval' (compiling WebAssembly only; JavaScript
 * eval stays blocked) and data: for connect-src (reading an inline data: URL;
 * it can't send anything anywhere).
 */
export function appContentSecurityPolicy({ https }: { https: boolean }) {
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only on https: on http://localhost it would send the page's requests to https and break them
    ...(https ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
}
