import { Hono } from 'hono'
import { describe, expect, test } from 'vitest'
import { CLIENT_IP_HEADER, clientIp } from '../src/auth/client-ip'

/*
  The client address used for rate limits, for each way of finding it
  (TRUST_PROXY_HOPS, CLIENT_IP_HEADER). Whatever a client puts in our own
  header or in X-Forwarded-For must never become its address.
*/

function server(options: Parameters<typeof clientIp>[0]) {
  const app = new Hono()
  app.use(clientIp(options))
  app.get('/', (c) => c.text(c.req.header(CLIENT_IP_HEADER) ?? 'none'))
  return async (headers: Record<string, string> = {}) => {
    const response = await app.request('/', { headers }, { incoming: { socket: { remoteAddress: '10.0.0.9', remotePort: 1234 } } })
    return response.text()
  }
}

describe('clientIp', () => {
  test('no proxies: the connection address, whatever the headers say', async () => {
    const ask = server({ trustedProxyHops: 0 })
    expect(await ask()).toBe('10.0.0.9')
    expect(await ask({ 'x-forwarded-for': '1.1.1.1', [CLIENT_IP_HEADER]: '2.2.2.2' })).toBe('10.0.0.9')
  })

  test('N proxies: the Nth address from the right of X-Forwarded-For', async () => {
    const ask = server({ trustedProxyHops: 1 })
    expect(await ask({ 'x-forwarded-for': 'fake-by-client, 203.0.113.7' })).toBe('203.0.113.7')
  })

  test("a platform header (Render's Cloudflare edge): its first address, ignoring X-Forwarded-For", async () => {
    const ask = server({ trustedProxyHops: 1, header: 'cf-connecting-ip' })
    expect(await ask({ 'cf-connecting-ip': '198.51.100.4', 'x-forwarded-for': '1.1.1.1' })).toBe('198.51.100.4')
    // Header missing (request didn't pass the edge): fall back to the connection
    expect(await ask({ 'x-forwarded-for': '1.1.1.1' })).toBe('10.0.0.9')
  })
})
