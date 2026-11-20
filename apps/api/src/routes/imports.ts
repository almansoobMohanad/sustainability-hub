import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi'
import { bodyLimit } from 'hono/body-limit'
import type { Database } from '@hub/db'
import { IMPORT_CELL_LIMITS, IMPORT_LIMITS, importActions } from '@hub/shared/imports'
import { can } from '@hub/shared/permissions'
import type { CompanyVariables } from '../auth/require-company'
import { checkImportRows, type CheckedRow } from '../emissions/import-check'
import { decodeImportCursor, findImport, listImports, saveImport, toImportJson, undoImport } from '../emissions/import-store'
import { requiresVerification } from '../emissions/entry-store'
import { errorResponse, forbidden } from './common'

/*
  Spreadsheet imports of emission entries (the app reads the file; rows come as JSON).

    POST /api/v1/emissions/imports/check       check the rows: every problem with its row and column (saves nothing)
    POST /api/v1/emissions/imports             check again and save them all in one transaction
    GET  /api/v1/emissions/imports             recent imports, newest first, keyset pages
    GET  /api/v1/emissions/imports/{id}        one import
    POST /api/v1/emissions/imports/{id}/undo   delete its entries (importer or Manager/Admin; none verified by a person)

  Registered on the emissions router (same session + active company middleware).
*/

const cell = (max: number) => z.string().max(max).nullish()

const ImportRowSchema = z
  .object({
    /** The spreadsheet's own row number, used in every message */
    row: z.number().int().min(1).max(1_048_576),
    month: cell(IMPORT_CELL_LIMITS.month),
    source: cell(IMPORT_CELL_LIMITS.source),
    amount: z.union([z.number(), z.string().max(IMPORT_CELL_LIMITS.amount)]).nullish(),
    unit: cell(IMPORT_CELL_LIMITS.unit),
    dataSource: cell(IMPORT_CELL_LIMITS.dataSource),
    notes: cell(IMPORT_CELL_LIMITS.notes),
  })
  .openapi('ImportRow')

const Rows = z
  .array(ImportRowSchema)
  .min(1, 'The file has no rows')
  .max(IMPORT_LIMITS.maxRows, `Import up to ${IMPORT_LIMITS.maxRows} rows at a time`)

const NoteSchema = z.object({ column: z.string().nullable(), message: z.string() })

const CheckedRowSchema = z
  .object({
    row: z.number().int(),
    problems: z.array(NoteSchema),
    warnings: z.array(NoteSchema),
    entry: z
      .object({
        period: z.string(),
        source: z.object({ id: z.uuid(), name: z.string(), category: z.string() }),
        scope: z.number().int(),
        amount: z.number(),
        unit: z.string(),
        factorYear: z.number().int(),
        co2eKg: z.number(),
      })
      .nullable(),
  })
  .openapi('CheckedImportRow')

const PersonSchema = z.object({ id: z.uuid(), name: z.string() }).nullable()

const ImportSchema = z
  .object({
    id: z.uuid(),
    fileName: z.string(),
    entryCount: z.number().int(),
    skippedRows: z.number().int(),
    createdBy: PersonSchema,
    createdAt: z.string(),
    undoneBy: PersonSchema,
    undoneAt: z.string().nullable(),
    remainingEntries: z.number().int(),
    verifiedByPerson: z.number().int(),
  })
  .openapi('EmissionImport')

const json = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } })

const checkRoute = createRoute({
  method: 'post',
  path: '/v1/emissions/imports/check',
  tags: ['Imports'],
  summary: 'Check the rows of a spreadsheet (nothing is saved)',
  request: { body: json(z.object({ rows: Rows })) },
  responses: {
    200: { description: 'Every row with its problems and warnings', ...json(z.object({ rows: z.array(CheckedRowSchema) })) },
    400: errorResponse('Invalid request'),
    401: errorResponse('Not signed in'),
    403: errorResponse('Not allowed'),
    413: errorResponse('Too large'),
  },
})

const importRoute = createRoute({
  method: 'post',
  path: '/v1/emissions/imports',
  tags: ['Imports'],
  summary: 'Import the rows as entries (checked again; all or nothing)',
  request: {
    body: json(
      z.object({
        fileName: z.string().trim().min(1).max(IMPORT_LIMITS.fileNameLength),
        rows: Rows,
        /** Import the valid rows and skip those with problems (the person chose that explicitly) */
        skipInvalid: z.boolean().default(false),
        /** How many entries the person saw in the check; if the check now differs, nothing is saved */
        expectedEntries: z.number().int().min(1),
      }),
    ),
  },
  responses: {
    201: { description: 'Imported', ...json(ImportSchema) },
    400: errorResponse('Rows with problems (and skipInvalid not set), or an invalid request'),
    401: errorResponse('Not signed in'),
    403: errorResponse('Not allowed'),
    409: errorResponse('The check gives a different result than before: check again'),
    413: errorResponse('Too large'),
  },
})

const listRoute = createRoute({
  method: 'get',
  path: '/v1/emissions/imports',
  tags: ['Imports'],
  summary: "The company's imports, newest first, one page at a time",
  request: {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(50).default(IMPORT_LIMITS.pageSize),
      cursor: z.string().max(200).optional(),
    }),
  },
  responses: {
    200: { description: 'One page', ...json(z.object({ items: z.array(ImportSchema), nextCursor: z.string().nullable() })) },
    400: errorResponse('Invalid query'),
    401: errorResponse('Not signed in'),
    403: errorResponse('No active company'),
  },
})

const IdParam = z.object({ id: z.uuid() })

const getRoute = createRoute({
  method: 'get',
  path: '/v1/emissions/imports/{id}',
  tags: ['Imports'],
  summary: 'One import',
  request: { params: IdParam },
  responses: {
    200: { description: 'The import', ...json(ImportSchema) },
    400: errorResponse('Invalid id'),
    401: errorResponse('Not signed in'),
    403: errorResponse('No active company'),
    404: errorResponse('Not found'),
  },
})

const undoRoute = createRoute({
  method: 'post',
  path: '/v1/emissions/imports/{id}/undo',
  tags: ['Imports'],
  summary: "Undo an import: delete its entries (the audit trail keeps a record of each)",
  request: { params: IdParam },
  responses: {
    200: { description: 'Undone', ...json(ImportSchema) },
    400: errorResponse('Invalid id'),
    401: errorResponse('Not signed in'),
    403: errorResponse('Not allowed'),
    404: errorResponse('Not found'),
    409: errorResponse('Already undone, or entries were verified since'),
  },
})

const notFound = { error: { code: 'not_found', message: 'This import does not exist.' } }

/** What the app needs per row (the stored entry has more) */
const rowJson = (row: CheckedRow) => ({
  row: row.row,
  problems: row.problems,
  warnings: row.warnings,
  entry: row.entry && {
    period: row.entry.period,
    source: { id: row.entry.sourceId, ...row.entry.source },
    scope: row.entry.scope,
    amount: row.entry.amount,
    unit: row.entry.unit,
    factorYear: row.entry.factorYear,
    co2eKg: row.entry.co2eKg,
  },
})

const rowCount = (count: number) => (count === 1 ? '1 row' : `${count} rows`)

export function registerImportRoutes(app: OpenAPIHono<{ Variables: CompanyVariables }>, { db }: { db: Database }) {
  // 1,000 rows with every cell at its limit stay under 2 MB; refuse anything bigger before reading it
  const limit = bodyLimit({
    maxSize: 3 * 1024 * 1024,
    onError: (c) => c.json({ error: { code: 'too_large', message: 'The file is too large to import at once.' } }, 413),
  })
  app.use('/v1/emissions/imports', limit)
  app.use('/v1/emissions/imports/check', limit)

  app.openapi(checkRoute, async (c) => {
    if (!can(c.var.company.role, 'emissions', 'create')) return c.json(forbidden, 403)
    const rows = await checkImportRows(db, c.var.company.id, c.req.valid('json').rows)
    return c.json({ rows: rows.map(rowJson) }, 200)
  })

  app.openapi(importRoute, async (c) => {
    if (!can(c.var.company.role, 'emissions', 'create')) return c.json(forbidden, 403)
    const { fileName, rows, skipInvalid, expectedEntries } = c.req.valid('json')
    const companyId = c.var.company.id

    // Checked again: sources, factors or the settings may have changed since the preview
    const [checked, needsVerification] = await Promise.all([
      checkImportRows(db, companyId, rows),
      requiresVerification(db, companyId),
    ])
    const valid = checked.filter((row) => row.entry)
    const invalid = checked.length - valid.length
    if (invalid > 0 && !skipInvalid) {
      return c.json(
        {
          error: {
            code: 'rows_invalid',
            message: `${rowCount(invalid)} ${invalid === 1 ? 'has' : 'have'} problems. Fix them, or choose to skip them.`,
          },
        },
        400,
      )
    }
    if (valid.length === 0) {
      return c.json({ error: { code: 'rows_invalid', message: 'No row can be imported.' } }, 400)
    }
    if (valid.length !== expectedEntries) {
      return c.json(
        {
          error: {
            code: 'check_changed',
            message: `Something changed since the file was checked: ${valid.length} of its rows can be imported now, not ${expectedEntries}. Check the file again.`,
          },
        },
        409,
      )
    }

    const id = await saveImport(db, {
      companyId,
      userId: c.var.user.id,
      fileName,
      rows: valid.map((row) => ({ row: row.row, entry: row.entry! })),
      skippedRows: invalid,
      needsVerification,
    })
    return c.json(toImportJson((await findImport(db, companyId, id))!), 201)
  })

  app.openapi(listRoute, async (c) => {
    const { limit, cursor } = c.req.valid('query')
    const position = cursor ? decodeImportCursor(cursor) : null
    if (cursor && !position) {
      return c.json({ error: { code: 'invalid_request', message: 'cursor: Invalid cursor' } }, 400)
    }
    const result = await listImports(db, c.var.company.id, { limit, cursor: position })
    return c.json({ items: result.page.map(toImportJson), nextCursor: result.nextCursor }, 200)
  })

  app.openapi(getRoute, async (c) => {
    const row = await findImport(db, c.var.company.id, c.req.valid('param').id)
    if (!row) return c.json(notFound, 404)
    return c.json(toImportJson(row), 200)
  })

  app.openapi(undoRoute, async (c) => {
    const { id } = c.req.valid('param')
    const companyId = c.var.company.id
    const row = await findImport(db, companyId, id)
    if (!row) return c.json(notFound, 404)
    const actions = importActions(c.var.company.role, c.var.user.id, {
      createdById: row.createdById,
      undone: row.undoneAt !== null,
      verifiedByPerson: row.verifiedByPerson,
    })
    if (row.undoneAt) {
      return c.json({ error: { code: 'already_undone', message: 'This import was already undone.' } }, 409)
    }
    if (!actions.undo && !actions.undoBlocked) return c.json(forbidden, 403)

    // Checked again inside the transaction, with the entries locked
    const result = await undoImport(db, companyId, id, c.var.user.id)
    if (!result.ok) {
      if (result.reason === 'not_found') return c.json(notFound, 404)
      const message =
        result.reason === 'verified'
          ? importActions(c.var.company.role, c.var.user.id, { createdById: row.createdById, undone: false, verifiedByPerson: result.verified })
              .undoBlocked!
          : 'This import was already undone.'
      return c.json({ error: { code: result.reason === 'verified' ? 'entries_verified' : 'already_undone', message } }, 409)
    }
    return c.json(toImportJson((await findImport(db, companyId, id))!), 200)
  })
}
