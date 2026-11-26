// Quick checks that a running server (Docker image, a new Vercel version, production) works:
//   node scripts/smoke-test.mjs <address> [--wait <seconds>] [--expect-version <commit>]
// Waits until /api/health answers (the server may still be migrating), then
// checks the database, the app's page, its code files and the security
// headers. Exits with 1 and says what failed, so CI can stop a bad version.
//
//   --expect-version  the address must be running this commit (/api/health
//                     "version"), so a test never passes against an older version
//   VERCEL_AUTOMATION_BYPASS_SECRET (environment): sent as the
//                     x-vercel-protection-bypass header, for a new Vercel version
//                     that isn't live yet (its own address is behind Vercel's login)
const [base, ...options] = process.argv.slice(2)
if (!base || base.startsWith('--')) {
  console.error('Usage: node scripts/smoke-test.mjs <address> [--wait <seconds>] [--expect-version <commit>]')
  process.exit(1)
}
const option = (name) => {
  const index = options.indexOf(name)
  return index >= 0 ? options[index + 1] : undefined
}
const waitSeconds = Number(option('--wait') ?? 120)
const expectedVersion = option('--expect-version')
const url = (path) => new URL(path, base).toString()

const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const get = (path, headers = {}) =>
  fetch(url(path), {
    headers: { ...headers, ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}) },
    signal: AbortSignal.timeout(15_000),
  })

const failures = []
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`)
  if (!ok) failures.push(label)
}

// 1. Wait for the server (first start migrates and loads the factor library) and,
//    if asked, for the expected version (a domain can take a moment to switch over)
const started = Date.now()
let health
let lastAnswer = 'no answer'
while (Date.now() - started < waitSeconds * 1000) {
  try {
    const response = await get('/api/health')
    lastAnswer = `HTTP ${response.status}`
    if (response.ok) {
      health = await response.json()
      if (!expectedVersion || health.version === expectedVersion) break
      lastAnswer = `version ${health.version ?? '(none)'}`
    }
  } catch {
    // not up yet
  }
  await new Promise((resolve) => setTimeout(resolve, 2000))
}
check(Boolean(health), `/api/health answers within ${waitSeconds} s (last: ${lastAnswer})`)
if (!health) {
  if (lastAnswer === 'HTTP 401' && !bypass) console.error('401: this address is protected. Set VERCEL_AUTOMATION_BYPASS_SECRET.')
  process.exit(1)
}
if (expectedVersion) {
  check(health.version === expectedVersion, `runs version ${expectedVersion} (found: ${health.version ?? 'none'})`)
}
check(health.database === 'up', 'the database is up')

// 2. The app's page, for the home page and a deep link
for (const path of ['/', '/emissions?year=2025']) {
  const response = await get(path)
  const html = await response.text()
  check(response.ok && html.includes('<div id="root">'), `${path} is the app's page`)
  check(response.headers.get('cache-control') === 'no-cache', `${path} is never cached`)
  check((response.headers.get('content-security-policy') ?? '').includes("script-src 'self'"), `${path} has the security policy`)
}

// 3. Its code: found, compressed, cached for a long time
const page = await (await get('/')).text()
const script = page.match(/\/assets\/[^"]+\.js/)?.[0]
check(Boolean(script), 'the page refers to its code file')
if (script) {
  const response = await get(script, { 'accept-encoding': 'br, gzip' })
  check(response.ok, `${script} is served`)
  check((response.headers.get('cache-control') ?? '').includes('immutable'), `${script} is cached as immutable`)
}

// 4. The API: JSON errors, security headers
const unknown = await get('/api/v1/no-such-endpoint')
check(unknown.status === 404 && (await unknown.json()).error?.code === 'not_found', 'unknown API addresses are JSON 404s')
const me = await get('/api/v1/me')
check(me.status === 401, '/api/v1/me needs a sign-in')
check(me.headers.get('x-content-type-options') === 'nosniff', 'security headers are set')
check((await get('/api/v1/auth-options')).ok, 'sign-in options answer')

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed at ${base}`)
  process.exit(1)
}
console.log(`\nAll checks passed at ${base}`)
