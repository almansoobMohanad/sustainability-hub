import { createRoute, z } from '@hono/zod-openapi'
import { and, eq, sql, type Database } from '@hub/db'
import { esgReadyReportEdits, esgReadyReports, organizations, users } from '@hub/db/schema'
import { ESG_FIELDS, ESG_FIELD_QUESTION, ESG_LIMITS, parseEsgValue, type EsgAnswers } from '@hub/shared/esg-ready'
import { can } from '@hub/shared/permissions'
import type { Auth } from '../auth/auth'
import { requireCompany, type CompanyVariables } from '../auth/require-company'
import { requireSession } from '../auth/require-session'
import { listEdits, recordEdit, textArray } from '../reports/report-history'
import { createRouter, currentYear, errorResponse, forbidden } from './common'
import { PersonSchema, historyRoute, invalid, yearParam } from './report-common'

/*
  ESG Ready, MITI's ESG readiness self-assessment, of the active company: one
  per calendar year. Admins and Managers only (reports:update), like SEDG.

    GET   /api/v1/reports/esg-ready/{year}           the answers, filled-in company details, last edit
    PATCH /api/v1/reports/esg-ready/{year}           save changes (the page autosaves: only changed fields)
    GET   /api/v1/reports/esg-ready/{year}/history   who answered what and when

  The questions and the score are in @hub/shared/esg-ready (the app works out
  the score from the answers; nothing about it is stored). Saving merges the
  sent answers into the stored ones and records the history, as for SEDG.
*/

const ValueSchema = z.union([z.string(), z.array(z.string())])

const ReportSchema = z
  .object({
    year: z.number().int(),
    /** Answers by field key: an option id, several option ids, or text */
    answers: z.record(z.string(), ValueSchema),
    /** Filled in until someone enters their own: the company name, the signed-in person's email */
    automatic: z.record(z.string(), z.object({ value: z.string(), note: z.string() })),
    /** This year, last year and years with a saved questionnaire, newest first */
    years: z.array(z.number().int()),
    updatedAt: z.string().nullable(),
    updatedBy: PersonSchema,
  })
  .openapi('EsgReadyReport')

const BASE = '/v1/reports/esg-ready'

const getRoute = createRoute({
  method: 'get',
  path: `${BASE}/{year}`,
  tags: ['Reports'],
  summary: 'The ESG Ready self-assessment of a year (Admin, Manager)',
  request: { params: yearParam },
  responses: {
    200: { description: 'The questionnaire', content: { 'application/json': { schema: ReportSchema } } },
    400: errorResponse('Invalid year'),
    401: errorResponse('Not signed in'),
    403: errorResponse('Not allowed (Members) or no active company'),
  },
})

const patchRoute = createRoute({
  method: 'patch',
  path: `${BASE}/{year}`,
  tags: ['Reports'],
  summary: 'Save answers to the ESG Ready self-assessment of a year (Admin, Manager)',
  request: {
    params: yearParam,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            /** Field key -> new answer; null removes it */
            answers: z
              .record(z.string(), z.union([ValueSchema, z.null()]))
              .refine((answers) => Object.keys(answers).length > 0, 'Nothing to save'),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Saved',
      content: { 'application/json': { schema: z.object({ updatedAt: z.string(), updatedBy: PersonSchema }) } },
    },
    400: errorResponse('Invalid request or answer'),
    401: errorResponse('Not signed in'),
    403: errorResponse('Not allowed'),
  },
})

export function esgReadyRoutes({ db, auth }: { db: Database; auth: Auth }) {
  const app = createRouter<{ Variables: CompanyVariables }>()
  app.use(`${BASE}/*`, requireSession(auth), requireCompany(db), async (c, next) => {
    if (!can(c.var.company.role, 'reports', 'update')) return c.json(forbidden, 403)
    await next()
  })

  app.openapi(getRoute, async (c) => {
    const { year } = c.req.valid('param')
    if (year > currentYear()) return c.json(invalid("A self-assessment can't be for a future year."), 400)
    const companyId = c.var.company.id

    const [[report], [company], saved] = await Promise.all([
      db
        .select({
          answers: esgReadyReports.answers,
          updatedAt: esgReadyReports.updatedAt,
          editorId: users.id,
          editorName: users.name,
        })
        .from(esgReadyReports)
        .leftJoin(users, eq(users.id, esgReadyReports.updatedBy))
        .where(and(eq(esgReadyReports.organizationId, companyId), eq(esgReadyReports.year, year))),
      db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, companyId)),
      db
        .select({ year: esgReadyReports.year })
        .from(esgReadyReports)
        .where(eq(esgReadyReports.organizationId, companyId)),
    ])

    const years = new Set([currentYear(), currentYear() - 1, year, ...saved.map((row) => row.year)])
    return c.json(
      {
        year,
        answers: report?.answers ?? {},
        automatic: {
          companyName: { value: company?.name ?? '', note: 'Your company name' },
          userEmail: { value: c.var.user.email, note: 'Your email address' },
        },
        years: [...years].filter((item) => item <= currentYear()).sort((a, b) => b - a),
        updatedAt: report ? report.updatedAt.toISOString() : null,
        updatedBy: report?.editorId ? { id: report.editorId, name: report.editorName ?? '' } : null,
      },
      200,
    )
  })

  app.openapi(patchRoute, async (c) => {
    const { year } = c.req.valid('param')
    if (year > currentYear()) return c.json(invalid("A self-assessment can't be for a future year."), 400)

    // Every field must exist and every answer pass the same rules the form shows
    const entries = Object.entries(c.req.valid('json').answers)
    if (entries.length > ESG_LIMITS.changesPerSave) return c.json(invalid('Too many changes in one save.'), 400)
    const set: EsgAnswers = {}
    const remove: string[] = []
    for (const [key, raw] of entries) {
      const field = ESG_FIELDS.get(key)
      if (!field) return c.json(invalid(`Unknown question "${key}".`), 400)
      if (raw === null) {
        remove.push(key)
        continue
      }
      const parsed = parseEsgValue(field, raw)
      if ('error' in parsed) return c.json(invalid(`Q${ESG_FIELD_QUESTION.get(key)}: ${parsed.error}`), 400)
      set[key] = parsed.value
    }
    const changed = [...new Set(entries.map(([key]) => `Q${ESG_FIELD_QUESTION.get(key)}`))]
    const companyId = c.var.company.id
    const userId = c.var.user.id

    const saved = await db.transaction(async (tx) => {
      // Create the year's questionnaire, or merge into it (removed keys out, sent ones in)
      const [report] = await tx
        .insert(esgReadyReports)
        .values({ organizationId: companyId, year, answers: set, createdBy: userId, updatedBy: userId })
        .onConflictDoUpdate({
          target: [esgReadyReports.organizationId, esgReadyReports.year],
          set: {
            answers: sql`(${esgReadyReports.answers} - ${textArray(remove)}) || ${JSON.stringify(set)}::jsonb`,
            updatedAt: sql`now()`,
            updatedBy: userId,
          },
        })
        .returning({ id: esgReadyReports.id, updatedAt: esgReadyReports.updatedAt })
      await recordEdit(tx, esgReadyReportEdits, { reportId: report!.id, actorId: userId, changed })
      return report!
    })

    return c.json({ updatedAt: saved.updatedAt.toISOString(), updatedBy: { id: userId, name: c.var.user.name } }, 200)
  })

  app.openapi(historyRoute(BASE, 'ESG Ready self-assessment'), async (c) => {
    const { year } = c.req.valid('param')
    const page = await listEdits(
      db,
      { reports: esgReadyReports, edits: esgReadyReportEdits },
      { companyId: c.var.company.id, year, cursor: c.req.valid('query').cursor },
    )
    return page ? c.json(page, 200) : c.json(invalid('Invalid cursor.'), 400)
  })

  return app
}
