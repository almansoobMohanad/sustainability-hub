import { request } from 'node:http'
import { MAILPIT_URL } from './settings'

/*
  The app's emails, read from Mailpit's API (dev: docker-compose; CI: a service
  container). Waits for the email, since the app sends them in the background.
*/

type Summary = { ID: string; To: { Address: string }[] | null }

async function search(query: string): Promise<Summary[]> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/search?limit=500&query=${encodeURIComponent(query)}`)
  if (!response.ok) throw new Error(`Mailpit search failed: HTTP ${response.status} (is Mailpit running at ${MAILPIT_URL}?)`)
  return ((await response.json()) as { messages: Summary[] | null }).messages ?? []
}

/** The first link in the newest email with this subject sent to this address */
export async function linkInEmail(to: string, subject: string, timeoutMs = 15_000): Promise<string> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const [newest] = await search(`to:"${to}" subject:"${subject}"`)
    if (newest) {
      const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${newest.ID}`)).json()) as { Text: string }
      const link = message.Text.match(/https?:\/\/\S+/)?.[0]
      if (!link) throw new Error(`The email "${subject}" to ${to} has no link`)
      return link
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`No email "${subject}" arrived for ${to} within ${timeoutMs / 1000} s`)
}

/** Deletes the emails sent to test accounts (e2e.<time>@example.com) and nothing else */
export async function deleteTestEmails() {
  const isTestAddress = (address: string) => /^e2e\.\d+@example\.com$/i.test(address)
  const ids = (await search('to:"@example.com"'))
    .filter((message) => message.To?.some((to) => isTestAddress(to.Address)))
    .map((message) => message.ID)
  if (ids.length === 0) return 0
  await deleteRequest(`${MAILPIT_URL}/api/v1/messages`, JSON.stringify({ IDs: ids }))
  return ids.length
}

// node:http instead of fetch: after a DELETE sent with fetch, Node 26 on Windows
// crashes when Playwright exits (libuv assertion "UV_HANDLE_CLOSING", exit 127)
function deleteRequest(url: string, body: string) {
  return new Promise<void>((resolve, reject) => {
    const headers = { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
    const req = request(url, { method: 'DELETE', agent: false, headers }, (response) => {
      response.resume()
      response.on('end', () =>
        response.statusCode === 200 ? resolve() : reject(new Error(`Mailpit delete failed: HTTP ${response.statusCode}`)),
      )
    })
    req.on('error', reject)
    req.end(body)
  })
}
