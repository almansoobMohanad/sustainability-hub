import { createRoute, z } from '@hono/zod-openapi'
import { and, desc, eq, sql, type Database } from '@hub/db'
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
import { intensityFigure, sedgFigures, type Figures } from '../reports/sedg-figures'
import { createRouter, currentYear, errorResponse, forbidden } from './common'

/*
  The SEDG disclosure report of the active company, one per calendar year.
  Admins and Managers only (permission reports:update); Members can't read it.

    GET   /api/v1/reports/sedg/{year}           the report: answers, calculated figures, last edit
    PATCH /api/v1/reports/sedg/{year}           save changes (the page autosaves: only changed fields)
    GET   /api/v1/reports/sedg/{year}/history   who edited what and when (newest first, keyset pages)

  A year without a saved report reads as an empty one; the first change creates it.
  Saving is one upsert that MERGES the sent fields into the stored answers
  (two people editing different fields never overwrite each other) plus one
  history write that extends the person's last edit when it's recent (see
  sedgReportEdits in packages/db/src/schema/reports.ts).
*/

const EDIT_MERGE_MINUTES = 15
const HISTORY_PAGE = 20

const ValueSchema = z.union([z.string(), z.number()])

const FigureSchema = z.object({ value: ValueSchema, note: z.string() })

const PersonSchema = z.object({ id: z.string(), name: z.string() }).nullable()

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

const EditSchema = z
  .object({
    id: z.string(),
    actor: PersonSchema,
    startedAt: z.string(),
    endedAt: z.string(),
    /** Disclosure codes ("E2.1"), "General" or "Level" */
    changed: z.array(z.string()),
  })
  .openapi('SedgEdit')

const yearParam = z.object({
  year: z.coerce
    .number()
    .int()
    .min(1990)
    .openapi({ param: { name: 'year', in: 'path' }, example: 2025 }),
})

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

const historyRoute = createRoute({
  method: 'get',
  path: '/v1/reports/sedg/{year}/history',
  tags: ['Reports'],
  summary: 'Who edited the SEDG report of a year, and what (Admin, Manager)',
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

/** Keyset cursor for the history: [ended_at as text (microseconds), id] */
const encodeCursor = (endedAt: string, id: string) => Buffer.from(JSON.stringify([endedAt, id])).toString('base64url')
function decodeCursor(cursor: string): [string, string] | null {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    return Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === 'string')
      ? (value as [string, string])
      : null
  } catch {
    return null
  }
}

const invalid = (message: string) => ({ error: { code: 'invalid_request', message } })

/** A text[] from ONE jsonb parameter (a JS array in a sql`` template would become one parameter per element) */
const textArray = (items: string[]) =>
  sql`array(select jsonb_array_elements_text(${JSON.stringify(items)}::jsonb))::text[]`

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

      // History: extend this person's edit if it ended less than 15 minutes ago, else start a new one
      const extended = await tx.execute(sql`
        update ${sedgReportEdits} set
          ended_at = now(),
          changed = array(select distinct unnest(${sedgReportEdits.changed} || ${textArray(changed)}) order by 1)
        where ${sedgReportEdits.id} = (
          select id from ${sedgReportEdits}
           where ${sedgReportEdits.reportId} = ${report!.id} and ${sedgReportEdits.actorId} = ${userId}
             and ${sedgReportEdits.endedAt} > now() - make_interval(mins => ${EDIT_MERGE_MINUTES})
           order by ${sedgReportEdits.endedAt} desc limit 1
        )
      `)
      if (extended.rowCount === 0) {
        await tx.insert(sedgReportEdits).values({ reportId: report!.id, actorId: userId, changed: [...changed].sort() })
      }
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

  app.openapi(historyRoute, async (c) => {
    const { year } = c.req.valid('param')
    const { cursor } = c.req.valid('query')
    const after = cursor ? decodeCursor(cursor) : null
    if (cursor && !after) return c.json(invalid('Invalid cursor.'), 400)

    const rows = await db
      .select({
        id: sedgReportEdits.id,
        startedAt: sedgReportEdits.startedAt,
        endedAt: sedgReportEdits.endedAt,
        endedAtText: sql<string>`${sedgReportEdits.endedAt}::text`,
        changed: sedgReportEdits.changed,
        actorId: users.id,
        actorName: users.name,
      })
      .from(sedgReportEdits)
      .innerJoin(sedgReports, eq(sedgReports.id, sedgReportEdits.reportId))
      .leftJoin(users, eq(users.id, sedgReportEdits.actorId))
      .where(
        and(
          eq(sedgReports.organizationId, c.var.company.id),
          eq(sedgReports.year, year),
          after ? sql`(${sedgReportEdits.endedAt}, ${sedgReportEdits.id}) < (${after[0]}::timestamptz, ${after[1]}::uuid)` : undefined,
        ),
      )
      .orderBy(desc(sedgReportEdits.endedAt), desc(sedgReportEdits.id))
      .limit(HISTORY_PAGE + 1)

    const page = rows.slice(0, HISTORY_PAGE)
    const last = page.at(-1)
    return c.json(
      {
        items: page.map((row) => ({
          id: row.id,
          actor: row.actorId ? { id: row.actorId, name: row.actorName ?? '' } : null,
          startedAt: row.startedAt.toISOString(),
          endedAt: row.endedAt.toISOString(),
          changed: row.changed,
        })),
        nextCursor: rows.length > HISTORY_PAGE && last ? encodeCursor(last.endedAtText, last.id) : null,
      },
      200,
    )
  })

  return app
}
