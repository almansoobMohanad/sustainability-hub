import { OpenAPIHono, z } from '@hono/zod-openapi'
import type { Env } from 'hono'
import type { ApiError } from '../app'

/*
  Shared pieces for /api/v1 routers.
*/

export const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) }).openapi('Error')

export const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
})

/**
 * A router whose invalid requests (bad query, body or path) answer in our
 * usual error shape, { error: { code, message } }, instead of the validator's
 * raw output.
 */
export function createRouter<E extends Env>() {
  return new OpenAPIHono<E>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const issue = result.error.issues[0]
        const where = issue?.path.length ? `${issue.path.join('.')}: ` : ''
        return c.json<ApiError>(
          { error: { code: 'invalid_request', message: `${where}${issue?.message ?? 'Invalid request'}` } },
          400,
        )
      }
    },
  })
}

export const forbidden = { error: { code: 'forbidden', message: "Your role in this company can't do this." } }

/** The calendar year right now; pages and lists default to it */
export const currentYear = () => new Date().getFullYear()
