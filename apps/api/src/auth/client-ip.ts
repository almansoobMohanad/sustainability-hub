import { getConnInfo } from '@hono/node-server/conninfo'
import type { MiddlewareHandler } from 'hono'

/*
  Works out the real client IP address (used for rate limiting) and puts it in
  our own header, overwriting anything a client sent in it.

  Why not just trust X-Forwarded-For? Any client can send that header with a
  made-up address, so an attacker could use a new fake IP for every request and
  never hit a rate limit. Instead:
  - no trusted proxies (API reached directly): use the TCP connection's address
  - N trusted proxies: each proxy appends the address it received the request
    from, so the client is the Nth address counting from the RIGHT. Anything
    further left was written by the client and is ignored.
  - a named header (CLIENT_IP_HEADER), for platforms whose edge always
    OVERWRITES that header with the real address, e.g. Cloudflare's
    cf-connecting-ip in front of Render. Only safe when nobody can reach the API
    without passing that edge.
*/

export const CLIENT_IP_HEADER = 'x-hub-client-ip'

export function clientIp({ trustedProxyHops, header }: { trustedProxyHops: number; header?: string }): MiddlewareHandler {
  return async (c, next) => {
    let ip = getConnInfo(c).remote.address

    if (header) {
      const fromEdge = c.req.header(header)?.split(',')[0]?.trim()
      if (fromEdge) ip = fromEdge
    } else if (trustedProxyHops > 0) {
      const chain = (c.req.header('x-forwarded-for') ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
      const fromProxy = chain.at(-trustedProxyHops)
      if (fromProxy) ip = fromProxy
    }

    const headers = c.req.raw.headers
    if (ip) headers.set(CLIENT_IP_HEADER, ip)
    else headers.delete(CLIENT_IP_HEADER)
    await next()
  }
}
