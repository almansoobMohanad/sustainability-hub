// Quick checks that a running server (Docker image, staging, production) works:
//   node scripts/smoke-test.mjs http://127.0.0.1:3000 [--wait 120]
// Waits until /api/health answers (the server may still be migrating), then
// checks the database, the app's page, its code files and the security
// headers. Exits with 1 and says what failed, so CI can stop a bad version.
const [base, ...options] = process.argv.slice(2)
if (!base) {
  console.error('Usage: node scripts/smoke-test.mjs <address> [--wait <seconds>]')
  process.exit(1)
}
const waitIndex = options.indexOf('--wait')
const waitSeconds = waitIndex >= 0 ? Number(options[waitIndex + 1]) : 120
const url = (path) => new URL(path, base).toString()

const failures = []
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`)
  if (!ok) failures.push(label)
}

// 1. Wait for the server (first start migrates and loads the factor library)
const started = Date.now()
let health
while (Date.now() - started < waitSeconds * 1000) {
  try {
    const response = await fetch(url('/api/health'), { signal: AbortSignal.timeout(5000) })
    if (response.ok) {
      health = await response.json()
      break
    }
  } catch {
    // not up yet
  }
  await new Promise((resolve) => setTimeout(resolve, 2000))
}
check(Boolean(health), `/api/health answers within ${waitSeconds} s`)
if (!health) process.exit(1)
check(health.database === 'up', 'the database is up')

// 2. The app's page, for the home page and a deep link
for (const path of ['/', '/emissions?year=2025']) {
  const response = await fetch(url(path))
  const html = await response.text()
  check(response.ok && html.includes('<div id="root">'), `${path} is the app's page`)
  check(response.headers.get('cache-control') === 'no-cache', `${path} is never cached`)
  check((response.headers.get('content-security-policy') ?? '').includes("script-src 'self'"), `${path} has the security policy`)
}

// 3. Its code: found, compressed, cached for a long time
const page = await (await fetch(url('/'))).text()
const script = page.match(/\/assets\/[^"]+\.js/)?.[0]
check(Boolean(script), 'the page refers to its code file')
if (script) {
  const response = await fetch(url(script), { headers: { 'accept-encoding': 'br, gzip' } })
  check(response.ok, `${script} is served`)
  check((response.headers.get('cache-control') ?? '').includes('immutable'), `${script} is cached as immutable`)
}

// 4. The API: JSON errors, security headers
const unknown = await fetch(url('/api/v1/no-such-endpoint'))
check(unknown.status === 404 && (await unknown.json()).error?.code === 'not_found', 'unknown API addresses are JSON 404s')
const me = await fetch(url('/api/v1/me'))
check(me.status === 401, '/api/v1/me needs a sign-in')
check(me.headers.get('x-content-type-options') === 'nosniff', 'security headers are set')
check((await fetch(url('/api/v1/auth-options'))).ok, 'sign-in options answer')

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed at ${base}`)
  process.exit(1)
}
console.log(`\nAll checks passed at ${base}`)
