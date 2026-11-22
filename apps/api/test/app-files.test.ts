import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brotliCompressSync } from 'node:zlib'
import { Hono } from 'hono'
import { describe, expect, test } from 'vitest'
import { appContentSecurityPolicy, serveAppFiles } from '../src/app-files'

/*
  The API serving the built app (APP_FILES_DIR): which file each address gets,
  and the caching and security headers. A fake build folder, no database.
*/

const INDEX = '<!doctype html><title>Sustainability Hub</title><script type="module" src="/assets/index-abc123.js"></script>'
const CODE = 'console.log("app")'.repeat(100)

function buildFolder() {
  const dir = mkdtempSync(join(tmpdir(), 'hub-app-'))
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'index.html'), INDEX)
  writeFileSync(join(dir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  writeFileSync(join(dir, 'assets', 'index-abc123.js'), CODE)
  writeFileSync(join(dir, 'assets', 'index-abc123.js.br'), brotliCompressSync(CODE))
  return dir
}

function createServer() {
  const app = new Hono()
  app.get('/api/health', (c) => c.json({ status: 'ok' }))
  serveAppFiles(app, { dir: buildFolder(), contentSecurityPolicy: appContentSecurityPolicy({ https: true }) })
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'none' } }, 404))
  return app
}

describe('serveAppFiles', () => {
  const app = createServer()

  test("every page address gets the app's page, never cached, with the security policy", async () => {
    for (const path of ['/', '/index.html', '/emissions', '/settings/sources', '/invitations/123?x=1']) {
      const response = await app.request(path)
      expect(response.status, path).toBe(200)
      expect(await response.text()).toBe(INDEX)
      expect(response.headers.get('content-type')).toMatch(/text\/html/)
      expect(response.headers.get('cache-control')).toBe('no-cache')
      expect(response.headers.get('content-security-policy')).toContain("script-src 'self'")
    }
  })

  test('code files are cached for a year; the compressed copy goes to browsers that accept it', async () => {
    const plain = await app.request('/assets/index-abc123.js')
    expect(plain.status).toBe(200)
    expect(plain.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(plain.headers.get('content-type')).toMatch(/javascript/)
    expect(await plain.text()).toBe(CODE)

    const compressed = await app.request('/assets/index-abc123.js', { headers: { 'accept-encoding': 'gzip, br' } })
    expect(compressed.headers.get('content-encoding')).toBe('br')
    expect(Number(compressed.headers.get('content-length'))).toBeLessThan(CODE.length)
  })

  test("a missing code file is a 404, not the app's page (old version still open after a deploy)", async () => {
    const response = await app.request('/assets/index-old999.js')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).not.toMatch(/html/)
  })

  test('other files are served and cached for an hour', async () => {
    const response = await app.request('/favicon.svg')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/svg/)
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
  })

  test('the API keeps its own answers: real endpoints work, unknown ones are JSON 404s', async () => {
    expect(await (await app.request('/api/health')).json()).toEqual({ status: 'ok' })
    const unknown = await app.request('/api/v1/nothing-here')
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toMatchObject({ error: { code: 'not_found' } })
  })

  test('paths that try to leave the folder never read other files', async () => {
    for (const path of ['/../package.json', '/assets/../../secret', '/%2e%2e/package.json']) {
      const response = await app.request(path)
      expect(await response.text(), path).not.toContain('"name"')
    }
  })

  test('refuses to start without a built app', () => {
    const empty = mkdtempSync(join(tmpdir(), 'hub-empty-'))
    expect(() => serveAppFiles(new Hono(), { dir: empty, contentSecurityPolicy: '' })).toThrow(/no index.html/)
  })
})

describe('appContentSecurityPolicy', () => {
  test('upgrades requests to https only when the app is on https', () => {
    expect(appContentSecurityPolicy({ https: true })).toContain('upgrade-insecure-requests')
    expect(appContentSecurityPolicy({ https: false })).not.toContain('upgrade-insecure-requests')
    expect(appContentSecurityPolicy({ https: false })).toContain("frame-ancestors 'none'")
  })
})
