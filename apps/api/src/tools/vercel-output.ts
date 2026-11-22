import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { appContentSecurityPolicy } from '../app-files'
import { SECURE_HEADERS } from '../security-headers'

/*
  Packages the built app and the API function in Vercel's "Build Output API"
  format (.vercel/output at the repository root), which Vercel deploys as is:
    static/                 the built app (apps/app/dist), served by Vercel's CDN
    functions/api.func/     the API (apps/api/dist-vercel), one Node.js function
    config.json             routing rules and headers
  It does on Vercel what app-files.ts does in the Docker image, with the same
  rules: /api/* goes to the API; code files are cached for a year; a missing
  code file is a 404 (never the app's page); every other address gets the app's
  page, never cached, with the Content-Security-Policy; the same security
  headers everywhere. Run after both builds: `pnpm --filter @hub/api vercel:output`.
*/

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../../..')
const appDist = join(repo, 'apps/app/dist')
const functionDist = join(repo, 'apps/api/dist-vercel')
const output = join(repo, '.vercel/output')

for (const [folder, how] of [
  [join(appDist, 'index.html'), 'pnpm --filter @hub/app build'],
  [join(functionDist, 'index.mjs'), 'pnpm --filter @hub/api build:vercel'],
]) {
  if (!existsSync(folder)) {
    console.error(`Missing ${folder}: run \`${how}\` first.`)
    process.exit(1)
  }
}

rmSync(output, { recursive: true, force: true })

// 1. The app. Vercel compresses on its own, so precompressed copies (Docker build) are left out.
cpSync(appDist, join(output, 'static'), {
  recursive: true,
  filter: (source) => !source.endsWith('.br') && !source.endsWith('.gz'),
})

// 2. The API function, in the region next to the database (Supabase: Singapore)
const region = process.env.VERCEL_FUNCTION_REGION || 'sin1'
const fn = join(output, 'functions/api.func')
mkdirSync(fn, { recursive: true })
cpSync(functionDist, fn, { recursive: true })
writeJson(join(fn, '.vc-config.json'), {
  // The Node.js version this build runs on (the project's Node.js setting), so code and runtime match
  runtime: `nodejs${process.versions.node.split('.')[0]}.x`,
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  // Hono reads the raw request itself (Vercel's helpers would consume the body first)
  shouldAddHelpers: false,
  regions: [region],
  // Seconds; a bulk import of 1,000 rows takes well under one
  maxDuration: 60,
})

// 3. Routing. Same security headers as the API's own answers (Hono builds them, so they can't drift).
const probe = new Hono()
probe.use(secureHeaders(SECURE_HEADERS))
probe.get('/', (c) => c.body(null, 204))
const securityHeaders = Object.fromEntries(
  [...(await probe.request('/')).headers].filter(([name]) => !name.startsWith('content-')),
)

const https = (process.env.APP_URL ?? 'https://').startsWith('https://')
const NOT_API = '(?!api(?:/|$))'
writeJson(join(output, 'config.json'), {
  version: 3,
  routes: [
    // Headers first (`continue`: keep matching)
    { src: `^/${NOT_API}.*$`, headers: securityHeaders, continue: true },
    { src: '^/assets/.*$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
    // The app's pages: every address without a dot in it (no file name), and index.html itself
    {
      src: `^/${NOT_API}(?!assets/)(?:[^.]*|index\\.html)$`,
      headers: { 'cache-control': 'no-cache', 'content-security-policy': appContentSecurityPolicy({ https }) },
      continue: true,
    },
    // The API (its own headers, caching and JSON 404s). The function sees the original address.
    { src: '^/api(?:/.*)?$', dest: '/api' },
    // Files that exist
    { handle: 'filesystem' },
    // A code file that doesn't exist (an old version's, after a deploy): a 404, so the app reloads itself
    { src: '^/assets/.*$', status: 404 },
    // Everything else: the app's page (the router picks the page)
    { src: '^/.*$', dest: '/index.html' },
  ],
})

console.log(`Vercel output written to ${output} (function region ${region}).`)

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}
