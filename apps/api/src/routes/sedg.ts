import { createRoute, z } from '@hono/zod-openapi'
import { and, eq, sql, type Database } from '@hub/db'
import { companySettings, emissionEntries, organizations, sedgReportEdits, sedgReports, users } from '@hub/db/schema'
import { can } from '@hub/shared/permissions'
import {
  SEDG_FIELDS,
  SEDG_FIELD_CODES,
  SEDG_LEVELS,
  SEDG_LIMITS,
  isSedgLevel,
  parseSedgValue,
  type SedgAnswers,
} from '@hub/shared/sedg'
import type { Auth } from '../auth/auth'
import { requireCompany, type CompanyVariables } from '../auth/require-company'
import { requireSession } from '../auth/require-session'
import { listEdits, recordEdit, textArray } from '../reports/report-history'
import { intensityFigure, sedgFigures, type Figures } from '../reports/sedg-figures'
import { createRouter, currentYear, errorResponse, forbidden } from './common'
import { PersonSchema, historyRoute, invalid, yearParam } from './report-common'

/*
  The SEDG disclosure report of the active company, one per calendar year.
  Admins and Managers only (permission reports:update); Members can't read it.

    GET   /api/v1/reports/sedg/{year}           the report: answers, calculated figures, last edit
    PATCH /api/v1/reports/sedg/{year}           save changes (the page autosaves: only changed fields)
    GET   /api/v1/reports/sedg/{year}/history   who edited what and when (newest first, keyset pages)

  A year without a saved report reads as an empty one; the first change creates it.
  Saving is one upsert that MERGES the sent fields into the stored answers
  (two people editing different fields never overwrite each other) plus one
  history write that extends the person's last edit when it's recent
  (reports/report-history.ts).
*/

const ValueSchema = z.union([z.string(), z.number()])

const FigureSchema = z.object({ value: ValueSchema, note: z.string() })

const ReportSchema = z
  .object({
    year: z.number().int(),
    level: z.enum(SEDG_LEVELS),
    /** What people entered, by field key (@hub/shared/sedg) */
    answers: z.record(z.string(), ValueSchema),
    /** Figures calculated from verified entries and settings, by figure name (SEDG_AUTO_FIGURES) */
    automatic: z.record(z.string(), FigureSchema),
    baselineYear: z.number().int().nullable(),
    /** Years with verified entries or a saved report, newest first (for the year menu) */
    years: z.array(z.number().int()),
    /** null until the report is first saved */
    updatedAt: z.string().nullable(),
    updatedBy: PersonSchema,
  })
  .openapi('SedgReport')

const SavedSchema = z
  .object({ updatedAt: z.string(), updatedBy: PersonSchema, level: z.enum(SEDG_LEVELS) })
  .openapi('SedgSaved')

const getRoute = createRoute({
  method: 'get',
  path: '/v1/reports/sedg/{year}',
  tags: ['Reports'],
  summary: 'The SEDG report of a year (Admin, Manager)',
  request: { params: yearParam },
  responses: {
    200: { description: 'The report', content: { 'application/json': { schema: ReportSchema } } },
    400: errorResponse('Invalid year'),
    401: errorResponse('Not signed in'),
    403: errorResponse('Not allowed (Members) or no active company'),
  },
})

const patchRoute = createRoute({
  method: 'patch',
  path: '/v1/reports/sedg/{year}',
  tags: ['Reports'],
  summary: 'Save changes to the SEDG report of a year (Admin, Manager)',
  request: {
    params: yearParam,
    body: {
      content: {
        'application/json': {
          schema: z
            .object({
              level: z.enum(SEDG_LEVELS).optional(),
              /** Field key -> new value; null removes it (a calculated figure shows again) */
              answers: z.record(z.string(), z.union([ValueSchema, z.null()])).optional(),
            })
            .refine((body) => body.level !== undefined || Object.keys(body.answers ?? {}).length > 0, 'Nothing to save'),
        },
      },
    },
  },
  responses: {
    200: { description: 'Saved', content: { 'application/json': { schema: SavedSchema } } },
    400: errorResponse('Invalid request or value'),
    401: errorResponse('Not signed in'),
    403: errorResponse('Not allowed'),
  },
})

export function sedgRoutes({ db, auth }: { db: Database; auth: Auth }) {
  const app = createRouter<{ Variables: CompanyVariables }>()
  app.use('/v1/reports/sedg/*', requireSession(auth), requireCompany(db), async (c, next) => {
    if (!can(c.var.company.role, 'reports', 'update')) return c.json(forbidden, 403)
    await next()
  })

  async function findReport(companyId: string, year: number) {
    const editor = users
    const [row] = await db
      .select({
        id: sedgReports.id,
        level: sedgReports.level,
        answers: sedgReports.answers,
        updatedAt: sedgReports.updatedAt,
        editorId: editor.id,
        editorName: editor.name,
      })
      .from(sedgReports)
      .leftJoin(editor, eq(editor.id, sedgReports.updatedBy))
      .where(and(eq(sedgReports.organizationId, companyId), eq(sedgReports.year, year)))
    return row
  }

  app.openapi(getRoute, async (c) => {
    const { year } = c.req.valid('param')
    if (year > currentYear()) return c.json(invalid("A report can't be for a future year."), 400)
    const companyId = c.var.company.id

    const [report, [settings], [company], years] = await Promise.all([
      findReport(companyId, year),
      db.select({ baselineYear: companySettings.baselineYear }).from(companySettings).where(eq(companySettings.organizationId, companyId)),
      db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, companyId)),
      // Years worth offering: with verified entries or an existing report (two small index lookups)
      db.execute<{ year: number }>(sql`
        select distinct ${emissionEntries.reportingYear} as year from ${emissionEntries}
         where ${emissionEntries.organizationId} = ${companyId} and ${emissionEntries.status} = 'verified'
        union
        select ${sedgReports.year} from ${sedgReports} where ${sedgReports.organizationId} = ${companyId}
      `),
    ])

    const baselineYear = settings?.baselineYear ?? null
    const answers: SedgAnswers = report?.answers ?? {}
    const automatic: Figures = await sedgFigures(db, { companyId, companyName: company?.name ?? '', year, baselineYear })
    // E1.7 uses the figures the report shows: entered values win over calculated ones
    const shown = (key: string, figure: keyof Figures) => {
      const value = answers[key] ?? automatic[figure]?.value
      return typeof value === 'number' ? value : undefined
    }
    const revenue = answers.gen_revenue
    const intensity = intensityFigure(shown('e1_1', 'scope1'), shown('e1_2', 'scope2'), typeof revenue === 'number' ? revenue : undefined)
    if (intensity) automatic.intensity = intensity

    const offered = new Set([currentYear(), year, ...years.rows.map((row) => Number(row.year))])
    return c.json(
      {
        year,
        level: report && isSedgLevel(report.level) ? report.level : 'basic',
        answers,
        automatic,
        baselineYear,
        years: [...offered].filter((item) => item <= currentYear()).sort((a, b) => b - a),
        updatedAt: report ? report.updatedAt.toISOString() : null,
        updatedBy: report?.editorId ? { id: report.editorId, name: report.editorName ?? '' } : null,
      },
      200,
    )
  })

  app.openapi(patchRoute, async (c) => {
    const { year } = c.req.valid('param')
    if (year > currentYear()) return c.json(invalid("A report can't be for a future year."), 400)
    const body = c.req.valid('json')

    // Every field must exist and every value pass the same rules the form shows
    const entries = Object.entries(body.answers ?? {})
    if (entries.length > SEDG_LIMITS.changesPerSave) return c.json(invalid('Too many changes in one save.'), 400)
    const set: SedgAnswers = {}
    const remove: string[] = []
    for (const [key, raw] of entries) {
      const field = SEDG_FIELDS.get(key)
      if (!field) return c.json(invalid(`Unknown field "${key}".`), 400)
      if (raw === null) {
        remove.push(key)
        continue
      }
      const parsed = parseSedgValue(field, raw)
      if ('error' in parsed) return c.json(invalid(`${field.label}: ${parsed.error}`), 400)
      set[key] = parsed.value
    }

    const changed = [...new Set(entries.map(([key]) => SEDG_FIELD_CODES.get(key)!))]
    if (body.level !== undefined) changed.push('Level')
    const companyId = c.var.company.id
    const userId = c.var.user.id

    const saved = await db.transaction(async (tx) => {
      // Create the year's report, or merge into it: drop removed keys, then add/replace the sent ones
      const [report] = await tx
        .insert(sedgReports)
        .values({
          organizationId: companyId,
          year,
          level: body.level ?? 'basic',
          answers: set,
          createdBy: userId,
          updatedBy: userId,
        })
        .onConflictDoUpdate({
          target: [sedgReports.organizationId, sedgReports.year],
          set: {
            // Arrays go in as ONE jsonb parameter (Drizzle would spread a JS array into many)
            answers: sql`(${sedgReports.answers} - ${textArray(remove)}) || ${JSON.stringify(set)}::jsonb`,
            level: body.level === undefined ? sql`${sedgReports.level}` : body.level,
            updatedAt: sql`now()`,
            updatedBy: userId,
          },
        })
        .returning({ id: sedgReports.id, level: sedgReports.level, updatedAt: sedgReports.updatedAt })

      await recordEdit(tx, sedgReportEdits, { reportId: report!.id, actorId: userId, changed })
      return report!
    })

    return c.json(
      {
        updatedAt: saved.updatedAt.toISOString(),
        updatedBy: { id: userId, name: c.var.user.name },
        level: isSedgLevel(saved.level) ? saved.level : 'basic',
      },
      200,
    )
  })

  app.openapi(historyRoute('/v1/reports/sedg', 'SEDG report'), async (c) => {
    const { year } = c.req.valid('param')
    const page = await listEdits(
      db,
      { reports: sedgReports, edits: sedgReportEdits },
      { companyId: c.var.company.id, year, cursor: c.req.valid('query').cursor },
    )
    return page ? c.json(page, 200) : c.json(invalid('Invalid cursor.'), 400)
  })

  return app
}
