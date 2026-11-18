/*
  Calls to our own API (/api/v1/...). Same origin, so the session cookie goes
  along automatically. Errors from the API have the shape
  { error: { code, message } } and become an ApiRequestError with that message,
  which pages can show as is. A network failure throws the browser's TypeError.
*/

export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

type Options = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; json?: unknown; signal?: AbortSignal }

export async function api<T>(path: string, { method = 'GET', json, signal }: Options = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    signal,
    headers: json === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: json === undefined ? undefined : JSON.stringify(json),
  })
  if (response.status === 204) return undefined as T
  const body = (await response.json().catch(() => null)) as { error?: { code: string; message: string } } | null
  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      body?.error?.code ?? 'http_error',
      body?.error?.message ?? `The server answered with an error (HTTP ${response.status}).`,
    )
  }
  return body as T
}

/** A message for people: the API's own message, or a network hint. */
export function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) return error.message
  return "Couldn't reach the server. Check your connection and try again."
}
