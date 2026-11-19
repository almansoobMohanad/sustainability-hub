import { createRoute, z } from '@hono/zod-openapi'
import { and, eq, inArray, type Database } from '@hub/db'
import { emissionEntries, emissionEntryEvents } from '@hub/db/schema'
import {
  ENTRY_LIMITS,
  ENTRY_STATUSES,
  PERIOD_PATTERN,
  entryActions,
  latestReportablePeriod,
  periodBounds,
} from '@hub/shared/emissions'
import { can } from '@hub/shared/permissions'
import type { Auth } from '../auth/auth'
import { requireCompany, type CompanyVariables } from '../auth/require-company'
import { requireSession } from '../auth/require-session'
import {
  co2eOf,
  decodeCursor,
  entryEvents,
  entryNotes,
  factorFor,
  findEntry,
  isTrackedSource,
  listEntries,
  requiresVerification,
  sourceScope,
  statusCounts,
  toEntryJson,
  type EntryRow,
} from '../emissions/entry-store'
import { yearSummary } from '../emissions/summary'
import { createRouter, currentYear, errorResponse, forbidden } from './common'

/*
  Emission entries of the active company (requireCompany), and the dashboard summary.

    GET    /api/v1/emissions/entries                 list: filters + keyset pages (no notes)
    POST   /api/v1/emissions/entries                 add (everyone; the server calculates CO2e)
    GET    /api/v1/emissions/entries/{id}            one entry with notes and its history
    PATCH  /api/v1/emissions/entries/{id}            edit (not verified; creator or Manager/Admin)
    DELETE /api/v1/emissions/entries/{id}            delete (same rule)
    POST   /api/v1/emissions/entries/{id}/verify     Manager/Admin, Pending entries
    POST   /api/v1/emissions/entries/{id}/reject     Manager/Admin, Pending entries, with a reason
    POST   /api/v1/emissions/entries/{id}/reopen     Manager/Admin, verified -> Pending
    POST   /api/v1/emissions/entries/verify          Manager/Admin, up to 100 Pending entries at once
    GET    /api/v1/emissions/summary?year=2026       dashboard totals (SQL aggregation)

  Who may do what lives in @hub/shared/emissions (entryActions), shared with the app.
  Every change writes an event (the audit trail) in the same transaction.
*/

const EntrySchema = z
  .object({
    id: z.uuid(),
    period: z.string().openapi({ example: '2026-03' }),
    reportingYear: z.number().int(),
    scope: z.number().int(),
    source: z.object({ id: z.uuid(), name: z.string(), category: z.string() }),
    amount: z.number(),
    unit: z.string(),
    kgCo2ePerUnit: z.number(),
    /** The factor set the factor came from (can be an earlier year) */
    factorYear: z.number().int(),
    co2eKg: z.number(),
    dataSource: z.string().nullable(),
    status: z.enum(ENTRY_STATUSES),
    rejectionReason: z.string().nullable(),
    createdBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    createdAt: z.string(),
    reviewedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    reviewedAt: z.string().nullable(),
  })
  .openapi('EmissionEntry')

const EntryDetailSchema = EntrySchema.extend({
  notes: z.string().nullable(),
  events: z.array(
    z.object({
      action: z.string(),
      actor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
      details: z.record(z.string(), z.unknown()),
      createdAt: z.string(),
    }),
  ),
}).openapi('EmissionEntryDetail')

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null))

const Period = z
  .string()
  .regex(PERIOD_PATTERN, 'Use a month like 2026-03')
  .refine((period) => Number(period.slice(0, 4)) >= ENTRY_LIMITS.firstYear, `Use ${ENTRY_LIMITS.firstYear} or later`)
  .refine((period) => period <= latestReportablePeriod(), "The reporting month can't be in the future")

const Amount = z.number().positive('Enter an amount greater than 0').max(ENTRY_LIMITS.maxAmount, 'That amount looks too large')

const NewEntrySchema = z
  .object({
    sourceId: z.uuid(),
    unit: z.string().min(1).max(40),
    amount: Amount,
    period: Period,
    dataSource: optionalText(ENTRY_LIMITS.dataSourceLength),
    notes: optionalText(ENTRY_LIMITS.notesLength),
  })
  .openapi('NewEmissionEntry')

const EntryChangesSchema = z
  .object({
    unit: z.string().min(1).max(40).optional(),
    amount: Amount.optional(),
    period: Period.optional(),
    dataSource: optionalText(ENTRY_LIMITS.dataSourceLength).optional(),
    notes: optionalText(ENTRY_LIMITS.notesLength).optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, 'Nothing to change')
  .openapi('EmissionEntryChanges')

const IdParam = z.object({ id: z.uuid() })
const json = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } })

const listRoute = createRoute({
  method: 'get',
  path: '/v1/emissions/entries',
  tags: ['Emissions'],
  summary: "The company's entries, newest reporting period first, one page at a time",
  request: {
    query: z.object({
      year: z.coerce.number().int().min(ENTRY_LIMITS.firstYear).max(2100).optional(),
      status: z.enum(ENTRY_STATUSES).optional(),
      scope: z.coerce.number().int().min(1).max(3).optional(),
      sourceId: z.uuid().optional(),
      mine: z.enum(['true', 'false']).optional().openapi({ description: 'Only entries I created' }),
      limit: z.coerce.number().int().min(1).max(50).default(30),
      cursor: z.string().max(200).optional(),
    }),
  },
  responses: {
    200: {
      description: 'One page (total only on the first page)',
      ...json(
        z
          .object({ items: z.array(EntrySchema), nextCursor: z.string().nullable(), total: z.number().int().nullable() })
          .openapi('EmissionEntryPage'),
      ),
    },
    400: errorResponse('Invalid query'),
    401: errorResponse('Not signed in'),
    403: errorResponse('No active company'),
  },
})

const createEntryRoute = createRoute({
  method: 'post',
  path: '/v1/emissions/entries',
  tags: ['Emissions'],
  summary: 'Add an entry (emissions are calculated by the server)',
  request: { body: json(NewEntrySchema) },
  responses: {
    201: { description: 'Added', ...json(EntrySchema) },
    400: errorResponse('Invalid entry, source not tracked, or unit not available'),
    401: errorResponse('Not signed in'),
    403: errorResponse('Not allowed'),
  },
})

const getEntryRoute = createRoute({
  method: 'get',
  path: '/v1/emissions/entries/{id}',
  tags: ['Emissions'],
  summary: 'One entry with its notes and history',
  request: { params: IdParam },
  responses: {
    200: { description: 'The entry', ...json(EntryDetailSchema) },
    400: errorResponse('Invalid id'),
    401: errorResponse('Not signed in'),
    403: errorResponse('No active company'),
    404: errorResponse('Not found'),
  },
})

const updateEntryRoute = createRoute({
  method: 'patch',
  path: '/v1/emissions/entries/{id}',
  tags: ['Emissions'],
  summary: 'Change an entry that is not verified',
  request: { params: IdParam, body: json(EntryChangesSchema) },
  responses: {
    200: { description: 'Saved', ...json(EntrySchema) },
    400: errorResponse('Invalid changes'),
    401: errorResponse('Not signed in'),
    403: errorResponse('Not allowed'),
    404: errorResponse('Not found'),
    409: errorResponse('Verified (locked), or changed by someone else meanwhile'),
  },
})

const deleteEntryRoute = createRoute({
  method: 'delete',
  path: '/v1/emissions/entries/{id}',
  tags: ['Emissions'],
  summary: 'Delete an entry that is not verified',
  request: { params: IdParam },
  responses: {
    204: { description: 'Deleted (the audit trail keeps a record)' },
    400: errorResponse('Invalid id'),
    401: errorResponse('Not signed in'),
    403: errorResponse('Not allowed'),
    404: errorResponse('Not found'),
    409: errorResponse('Verified (locked)'),
  },
})

const reviewResponses = {
  200: { description: 'Done', ...json(EntrySchema) },
  400: errorResponse('Invalid request'),
  401: errorResponse('Not signed in'),
  403: errorResponse('Not allowed'),
  404: errorResponse('Not found'),
  409: errorResponse('The entry is not in the right status'),
}

const verifyRoute = createRoute({
  method: 'post',
  path: '/v1/emissions/entries/{id}/verify',
  tags: ['Emissions'],
  summary: 'Verify a Pending entry (Manager, Admin)',
  request: { params: IdParam },
  responses: reviewResponses,
})

const rejectRoute = createRoute({
  method: 'post',
  path: '/v1/emissions/entries/{id}/reject',
  tags: ['Emissions'],
  summary: 'Reject a Pending entry with a reason (Manager, Admin)',
  request: {
    params: IdParam,
    body: json(
      z.object({ reason: z.string().trim().min(3, 'Give a short reason').max(ENTRY_LIMITS.rejectionReasonLength) }),
    ),
  },
  responses: reviewResponses,
})

const reopenRoute = createRoute({
  method: 'post',
  path: '/v1/emissions/entries/{id}/reopen',
  tags: ['Emissions'],
  summary: 'Send a verified entry back to Pending (Manager, Admin)',
  request: { params: IdParam },
  responses: reviewResponses,
})

const bulkVerifyRoute = createRoute({
  method: 'post',
  path: '/v1/emissions/entries/verify',
  tags: ['Emissions'],
  summary: 'Verify several Pending entries at once (Manager, Admin)',
  request: { body: json(z.object({ ids: z.array(z.uuid()).min(1).max(ENTRY_LIMITS.bulkVerify) })) },
  responses: {
    200: {
      description: 'Entries that were Pending are now verified; others are skipped',
      ...json(z.object({ verified: z.number().int(), skipped: z.number().int() })),
    },
    400: errorResponse('Invalid request'),
    401: errorResponse('Not signed in'),
    403: errorResponse('Not allowed'),
  },
})

const summaryRoute = createRoute({
  method: 'get',
  path: '/v1/emissions/summary',
  tags: ['Emissions'],
  summary: 'Dashboard totals for a year, calculated in the database',
  request: { query: z.object({ year: z.coerce.number().int().min(ENTRY_LIMITS.firstYear).max(2100).optional() }) },
  responses: {
    200: {
      description: 'Totals in kg CO2e (rejected entries excluded; pending included and also reported separately)',
      ...json(
        z
          .object({
            year: z.number().int(),
            years: z.array(z.number().int()),
            totalKg: z.number(),
            byScope: z.object({ 1: z.number(), 2: z.number(), 3: z.number() }),
            pendingKg: z.number(),
            pendingEntries: z.number().int(),
            lastMonthWithData: z.number().int(),
            months: z.array(
              z.object({
                month: z.number().int(),
                byScope: z.object({ 1: z.number(), 2: z.number(), 3: z.number() }),
                total: z.number(),
                entries: z.number().int(),
                hasData: z.boolean(),
              }),
            ),
            previousYearSamePeriod: z.object({ totalKg: z.number(), complete: z.boolean() }),
          })
          .openapi('EmissionSummary'),
      ),
    },
    400: errorResponse('Invalid query'),
    401: errorResponse('Not signed in'),
    403: errorResponse('No active company'),
  },
})

const statusCountsRoute = createRoute({
  method: 'get',
  path: '/v1/emissions/status-counts',
  tags: ['Emissions'],
  summary: 'How many entries have each status (no year = all years)',
  request: {
    query: z.object({
      year: z.coerce.number().int().min(ENTRY_LIMITS.firstYear).max(2100).optional(),
      scope: z.coerce.number().int().min(1).max(3).optional(),
    }),
  },
  responses: {
    200: {
      description: 'Entries per status',
      ...json(
        z
          .object({ pending: z.number().int(), verified: z.number().int(), rejected: z.number().int() })
          .openapi('EmissionStatusCounts'),
      ),
    },
    400: errorResponse('Invalid query'),
    401: errorResponse('Not signed in'),
    403: errorResponse('No active company'),
  },
})

const notFound = { error: { code: 'not_found', message: 'This entry does not exist.' } }
const locked = {
  error: { code: 'entry_locked', message: "Verified entries can't be changed. A Manager or Admin can reopen it first." },
}
const conflict = {
  error: { code: 'conflict', message: 'Someone changed this entry in the meantime. Reload and try again.' },
}

/** A short description of an entry, kept in the audit trail */
const snapshot = (row: { periodStart: string; amount: number; unit: string; co2eKg: number }) => ({
  period: row.periodStart.slice(0, 7),
  amount: row.amount,
  unit: row.unit,
  co2eKg: row.co2eKg,
})

export function emissionRoutes({ db, auth }: { db: Database; auth: Auth }) {
  const app = createRouter<{ Variables: CompanyVariables }>()
  app.use('/v1/emissions/*', requireSession(auth), requireCompany(db))

  /** Re-read an entry after a change, in the list shape */
  async function reload(companyId: string, id: string) {
    return toEntryJson((await findEntry(db, companyId, id)) as EntryRow)
  }

  app.openapi(listRoute, async (c) => {
    const { year, status, scope, sourceId, mine, limit, cursor } = c.req.valid('query')
    const position = cursor ? decodeCursor(cursor) : null
    if (cursor && !position) {
      return c.json({ error: { code: 'invalid_request', message: 'cursor: Invalid cursor' } }, 400)
    }
    const result = await listEntries(
      db,
      c.var.company.id,
      { year, status, scope, sourceId, createdBy: mine === 'true' ? c.var.user.id : undefined },
      { limit, cursor: position },
    )
    return c.json({ items: result.page.map(toEntryJson), nextCursor: result.nextCursor, total: result.total }, 200)
  })

  app.openapi(createEntryRoute, async (c) => {
    if (!can(c.var.company.role, 'emissions', 'create')) return c.json(forbidden, 403)
    const input = c.req.valid('json')
    const companyId = c.var.company.id

    // Only the sources the company tracks (Emission sources page)
    if (!(await isTrackedSource(db, companyId, input.sourceId))) {
      return c.json(
        { error: { code: 'source_not_tracked', message: 'Your company does not track this emission source.' } },
        400,
      )
    }
    const { year, start, end } = periodBounds(input.period)
    const [{ factor, units }, scope, needsVerification] = await Promise.all([
      factorFor(db, input.sourceId, input.unit, year),
      sourceScope(db, input.sourceId),
      requiresVerification(db, companyId),
    ])
    if (!factor || !scope) {
      return c.json(
        {
          error: {
            code: 'unit_not_available',
            message: `This source can't be measured in "${input.unit}". Use one of: ${units.join(', ')}.`,
          },
        },
        400,
      )
    }

    const now = new Date()
    const id = await db.transaction(async (tx) => {
      const [entry] = await tx
        .insert(emissionEntries)
        .values({
          organizationId: companyId,
          sourceId: input.sourceId,
          scope,
          reportingYear: year,
          periodStart: start,
          periodEnd: end,
          amount: input.amount,
          unit: input.unit,
          factorYear: factor.year,
          kgCo2ePerUnit: factor.kgCo2ePerUnit,
          co2eKg: co2eOf(input.amount, factor.kgCo2ePerUnit),
          dataSource: input.dataSource,
          notes: input.notes,
          // The company setting: Pending until a Manager/Admin verifies, or verified straight away
          status: needsVerification ? 'pending' : 'verified',
          reviewedAt: needsVerification ? null : now,
          createdBy: c.var.user.id,
        })
        .returning()
      await tx.insert(emissionEntryEvents).values([
        { organizationId: companyId, entryId: entry.id, action: 'created', actorId: c.var.user.id, details: snapshot(entry) },
        ...(needsVerification
          ? []
          : [{ organizationId: companyId, entryId: entry.id, action: 'verified', actorId: null, details: { automatic: true } }]),
      ])
      return entry.id
    })
    return c.json(await reload(companyId, id), 201)
  })

  app.openapi(getEntryRoute, async (c) => {
    const { id } = c.req.valid('param')
    const row = await findEntry(db, c.var.company.id, id)
    if (!row) return c.json(notFound, 404)
    const [notes, events] = await Promise.all([entryNotes(db, id), entryEvents(db, c.var.company.id, id)])
    return c.json({ ...toEntryJson(row), notes, events }, 200)
  })

  app.openapi(updateEntryRoute, async (c) => {
    const { id } = c.req.valid('param')
    const changes = c.req.valid('json')
    const companyId = c.var.company.id
    const row = await findEntry(db, companyId, id)
    if (!row) return c.json(notFound, 404)
    const entry = toEntryJson(row)
    if (entry.status === 'verified') return c.json(locked, 409)
    if (!entryActions(c.var.company.role, c.var.user.id, { status: entry.status, createdById: row.createdById }).edit) {
      return c.json(forbidden, 403)
    }

    const period = changes.period ?? entry.period
    const unit = changes.unit ?? entry.unit
    const amount = changes.amount ?? entry.amount
    const { year, start, end } = periodBounds(period)

    // A new month or unit needs the factor for it; otherwise the entry keeps the factor it had
    let factorYear = entry.factorYear
    let kgCo2ePerUnit = entry.kgCo2ePerUnit
    if (period !== entry.period || unit !== entry.unit) {
      const { factor, units } = await factorFor(db, entry.source.id, unit, year)
      if (!factor) {
        return c.json(
          {
            error: {
              code: 'unit_not_available',
              message: `This source can't be measured in "${unit}". Use one of: ${units.join(', ')}.`,
            },
          },
          400,
        )
      }
      factorYear = factor.year
      kgCo2ePerUnit = factor.kgCo2ePerUnit
    }

    // A corrected rejected entry goes back for review (or straight to verified with automatic verification)
    const needsVerification = entry.status === 'rejected' ? await requiresVerification(db, companyId) : true
    const nextStatus = entry.status === 'rejected' ? (needsVerification ? 'pending' : 'verified') : entry.status
    const before = { ...snapshot(row), dataSource: row.dataSource }
    const after = {
      period,
      amount,
      unit,
      co2eKg: co2eOf(amount, kgCo2ePerUnit),
      dataSource: changes.dataSource === undefined ? row.dataSource : changes.dataSource,
    }
    const changed = Object.fromEntries(
      Object.entries(after)
        .filter(([key, value]) => before[key as keyof typeof before] !== value)
        .map(([key, value]) => [key, { from: before[key as keyof typeof before], to: value }]),
    )

    const saved = await db.transaction(async (tx) => {
      const updated = await tx
        .update(emissionEntries)
        .set({
          reportingYear: year,
          periodStart: start,
          periodEnd: end,
          amount,
          unit,
          factorYear,
          kgCo2ePerUnit,
          co2eKg: after.co2eKg,
          dataSource: after.dataSource,
          ...(changes.notes === undefined ? {} : { notes: changes.notes }),
          status: nextStatus,
          rejectionReason: null, // an edited entry is never Rejected any more
          reviewedBy: entry.status === 'rejected' ? null : row.reviewedById,
          reviewedAt: nextStatus === 'verified' ? new Date() : entry.status === 'rejected' ? null : row.reviewedAt,
        })
        // Only if nobody verified/changed it since we read it
        .where(and(eq(emissionEntries.id, id), eq(emissionEntries.status, entry.status)))
        .returning({ id: emissionEntries.id })
      if (updated.length === 0) return false
      await tx.insert(emissionEntryEvents).values([
        {
          organizationId: companyId,
          entryId: id,
          action: 'updated',
          actorId: c.var.user.id,
          details: { changes: changed, ...(changes.notes === undefined ? {} : { notesChanged: true }) },
        },
        ...(nextStatus === 'verified'
          ? [{ organizationId: companyId, entryId: id, action: 'verified', actorId: null, details: { automatic: true } }]
          : []),
      ])
      return true
    })
    if (!saved) return c.json(conflict, 409)
    return c.json(await reload(companyId, id), 200)
  })

  app.openapi(deleteEntryRoute, async (c) => {
    const { id } = c.req.valid('param')
    const companyId = c.var.company.id
    const row = await findEntry(db, companyId, id)
    if (!row) return c.json(notFound, 404)
    const entry = toEntryJson(row)
    if (entry.status === 'verified') return c.json(locked, 409)
    if (!entryActions(c.var.company.role, c.var.user.id, { status: entry.status, createdById: row.createdById }).delete) {
      return c.json(forbidden, 403)
    }
    const deleted = await db.transaction(async (tx) => {
      // Only if nobody verified it since we read it
      const removed = await tx
        .delete(emissionEntries)
        .where(and(eq(emissionEntries.id, id), eq(emissionEntries.status, entry.status)))
        .returning({ id: emissionEntries.id })
      if (removed.length === 0) return false
      // The entry's earlier events now have entry_id null (on delete set null); this one
      // records what was deleted, with its id, so the audit trail keeps it
      await tx.insert(emissionEntryEvents).values({
        organizationId: companyId,
        entryId: null,
        action: 'deleted',
        actorId: c.var.user.id,
        details: { entryId: id, source: entry.source.name, status: entry.status, ...snapshot(row) },
      })
      return true
    })
    if (!deleted) return c.json(conflict, 409)
    return c.body(null, 204)
  })

  /** verify / reject / reopen: one status change, only from the expected status */
  async function review(
    companyId: string,
    actorId: string,
    id: string,
    from: 'pending' | 'verified',
    to: 'verified' | 'rejected' | 'pending',
    reason?: string,
  ) {
    return db.transaction(async (tx) => {
      const changed = await tx
        .update(emissionEntries)
        .set({
          status: to,
          rejectionReason: to === 'rejected' ? reason : null,
          reviewedBy: to === 'pending' ? null : actorId,
          reviewedAt: to === 'pending' ? null : new Date(),
        })
        .where(and(eq(emissionEntries.organizationId, companyId), eq(emissionEntries.id, id), eq(emissionEntries.status, from)))
        .returning({ id: emissionEntries.id })
      if (changed.length === 0) return false
      const action = to === 'verified' ? 'verified' : to === 'rejected' ? 'rejected' : 'reopened'
      await tx
        .insert(emissionEntryEvents)
        .values({ organizationId: companyId, entryId: id, action, actorId, details: reason ? { reason } : {} })
      return true
    })
  }

  /** After a review that changed nothing: the entry is gone (404) or in another status (409) */
  async function reviewFailed(companyId: string, id: string, message: string) {
    const row = await findEntry(db, companyId, id)
    return row ? ({ status: 409, body: { error: { code: 'wrong_status', message } } } as const) : ({ status: 404, body: notFound } as const)
  }

  app.openapi(verifyRoute, async (c) => {
    if (!can(c.var.company.role, 'emissions', 'verify')) return c.json(forbidden, 403)
    const { id } = c.req.valid('param')
    const companyId = c.var.company.id
    if (!(await review(companyId, c.var.user.id, id, 'pending', 'verified'))) {
      const failed = await reviewFailed(companyId, id, 'Only Pending entries can be verified.')
      return c.json(failed.body, failed.status)
    }
    return c.json(await reload(companyId, id), 200)
  })

  app.openapi(rejectRoute, async (c) => {
    if (!can(c.var.company.role, 'emissions', 'verify')) return c.json(forbidden, 403)
    const { id } = c.req.valid('param')
    const { reason } = c.req.valid('json')
    const companyId = c.var.company.id
    if (!(await review(companyId, c.var.user.id, id, 'pending', 'rejected', reason))) {
      const failed = await reviewFailed(companyId, id, 'Only Pending entries can be rejected.')
      return c.json(failed.body, failed.status)
    }
    return c.json(await reload(companyId, id), 200)
  })

  app.openapi(reopenRoute, async (c) => {
    if (!can(c.var.company.role, 'emissions', 'verify')) return c.json(forbidden, 403)
    const { id } = c.req.valid('param')
    const companyId = c.var.company.id
    if (!(await review(companyId, c.var.user.id, id, 'verified', 'pending'))) {
      const failed = await reviewFailed(companyId, id, 'Only verified entries can be reopened.')
      return c.json(failed.body, failed.status)
    }
    return c.json(await reload(companyId, id), 200)
  })

  app.openapi(bulkVerifyRoute, async (c) => {
    if (!can(c.var.company.role, 'emissions', 'verify')) return c.json(forbidden, 403)
    const ids = [...new Set(c.req.valid('json').ids)]
    const companyId = c.var.company.id
    // One transaction, one UPDATE and one multi-row INSERT for the audit trail
    const verified = await db.transaction(async (tx) => {
      const rows = await tx
        .update(emissionEntries)
        .set({ status: 'verified', rejectionReason: null, reviewedBy: c.var.user.id, reviewedAt: new Date() })
        .where(
          and(
            eq(emissionEntries.organizationId, companyId),
            inArray(emissionEntries.id, ids),
            eq(emissionEntries.status, 'pending'),
          ),
        )
        .returning({ id: emissionEntries.id })
      if (rows.length > 0) {
        await tx.insert(emissionEntryEvents).values(
          rows.map((row) => ({
            organizationId: companyId,
            entryId: row.id,
            action: 'verified',
            actorId: c.var.user.id,
            details: { bulk: true },
          })),
        )
      }
      return rows.length
    })
    return c.json({ verified, skipped: ids.length - verified }, 200)
  })

  app.openapi(statusCountsRoute, async (c) => {
    const { year, scope } = c.req.valid('query')
    return c.json(await statusCounts(db, c.var.company.id, { year, scope }), 200)
  })

  app.openapi(summaryRoute, async (c) => {
    const year = c.req.valid('query').year ?? currentYear()
    return c.json(await yearSummary(db, c.var.company.id, year), 200)
  })

  return app
}
