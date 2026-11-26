import { createRoute, z } from '@hono/zod-openapi'
import { errorResponse } from './common'

/*
  Route pieces the reports (SEDG, ESG Ready) share: the year in the path, who
  last edited, and the history endpoint (reports/report-history.ts).
*/

export const PersonSchema = z.object({ id: z.string(), name: z.string() }).nullable()

export const EditSchema = z
  .object({
    id: z.string(),
    actor: PersonSchema,
    startedAt: z.string(),
    endedAt: z.string(),
    /** What changed: disclosure codes ("E2.1"), question numbers ("Q8"), "General" or "Level" */
    changed: z.array(z.string()),
  })
  .openapi('ReportEdit')

export const yearParam = z.object({
  year: z.coerce
    .number()
    .int()
    .min(1990)
    .openapi({ param: { name: 'year', in: 'path' }, example: 2025 }),
})

export const invalid = (message: string) => ({ error: { code: 'invalid_request', message } })

/** GET <base>/{year}/history: who edited the report and what, newest first */
export const historyRoute = (base: string, name: string) =>
  createRoute({
    method: 'get',
    path: `${base}/{year}/history`,
    tags: ['Reports'],
    summary: `Who edited the ${name} of a year, and what (Admin, Manager)`,
    request: {
      params: yearParam,
      query: z.object({ cursor: z.string().max(200).optional() }),
    },
    responses: {
      200: {
        description: 'Newest first, 20 per page',
        content: {
          'application/json': { schema: z.object({ items: z.array(EditSchema), nextCursor: z.string().nullable() }) },
        },
      },
      400: errorResponse('Invalid request'),
      401: errorResponse('Not signed in'),
      403: errorResponse('Not allowed'),
    },
  })
