import { alias, and, asc, count, eq, sql, type Database } from '@hub/db'
import { companySettings, companySources, emissionEntries, emissionEntryEvents, emissionSources, users } from '@hub/db/schema'
import { ENTRY_STATUSES, type EntryStatus } from '@hub/shared/emissions'
import { factorValuesFor } from '../factors/factor-values'

/*
  Database work for emission entries. Every function takes the company id and
  filters by it first: an entry of another company is simply "not found".
*/

const creator = alias(users, 'creator')
const reviewer = alias(users, 'reviewer')

/** The columns lists show (no notes: those come with the detail view) */
const listColumns = {
  id: emissionEntries.id,
  periodStart: emissionEntries.periodStart,
  reportingYear: emissionEntries.reportingYear,
  scope: emissionEntries.scope,
  sourceId: emissionEntries.sourceId,
  sourceName: emissionSources.name,
  sourceCategory: emissionSources.category,
  amount: emissionEntries.amount,
  unit: emissionEntries.unit,
  kgCo2ePerUnit: emissionEntries.kgCo2ePerUnit,
  factorYear: emissionEntries.factorYear,
  co2eKg: emissionEntries.co2eKg,
  dataSource: emissionEntries.dataSource,
  status: emissionEntries.status,
  rejectionReason: emissionEntries.rejectionReason,
  createdById: emissionEntries.createdBy,
  createdByName: creator.name,
  createdAt: emissionEntries.createdAt,
  reviewedById: emissionEntries.reviewedBy,
  reviewedByName: reviewer.name,
  reviewedAt: emissionEntries.reviewedAt,
  // created_at with full (microsecond) precision for the cursor; a JS Date would round it
  cursorCreatedAt: sql<string>`${emissionEntries.createdAt}::text`,
}

export type EntryRow = Awaited<ReturnType<typeof selectEntries>>[number]

function selectEntries(db: Database) {
  return db
    .select(listColumns)
    .from(emissionEntries)
    .innerJoin(emissionSources, eq(emissionSources.id, emissionEntries.sourceId))
    .leftJoin(creator, eq(creator.id, emissionEntries.createdBy))
    .leftJoin(reviewer, eq(reviewer.id, emissionEntries.reviewedBy))
}

/** The API's JSON shape of an entry */
export function toEntryJson(row: EntryRow) {
  return {
    id: row.id,
    period: row.periodStart.slice(0, 7),
    reportingYear: row.reportingYear,
    scope: row.scope,
    source: { id: row.sourceId, name: row.sourceName, category: row.sourceCategory },
    amount: row.amount,
    unit: row.unit,
    kgCo2ePerUnit: row.kgCo2ePerUnit,
    factorYear: row.factorYear,
    co2eKg: row.co2eKg,
    dataSource: row.dataSource,
    status: (ENTRY_STATUSES as readonly string[]).includes(row.status) ? (row.status as EntryStatus) : 'pending',
    rejectionReason: row.rejectionReason,
    createdBy: row.createdById ? { id: row.createdById, name: row.createdByName ?? 'Former member' } : null,
    createdAt: row.createdAt.toISOString(),
    reviewedBy: row.reviewedById ? { id: row.reviewedById, name: row.reviewedByName ?? 'Former member' } : null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  }
}

/*
  Keyset pagination, newest reporting period first: the cursor is the
  (period_start, created_at, id) of the last row sent, and the next page
  continues right after it in the company + period index.
*/
type Cursor = [periodStart: string, createdAt: string, id: string]

export const encodeCursor = (row: EntryRow) =>
  Buffer.from(JSON.stringify([row.periodStart, row.cursorCreatedAt, row.id])).toString('base64url')

export function decodeCursor(cursor: string): Cursor | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (
      Array.isArray(value) &&
      value.length === 3 &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(value[0])) &&
      typeof value[1] === 'string' &&
      !Number.isNaN(Date.parse(value[1])) &&
      /^[0-9a-f-]{36}$/i.test(String(value[2]))
    ) {
      return value as Cursor
    }
  } catch {
    // not base64/JSON: invalid
  }
  return null
}

export type EntryFilters = {
  year?: number
  status?: EntryStatus
  scope?: number
  sourceId?: string
  importId?: string
  createdBy?: string
}

function filterConditions(companyId: string, filters: EntryFilters) {
  return [
    eq(emissionEntries.organizationId, companyId),
    // A year is a period_start range, so the company + period index serves it
    filters.year ? sql`${emissionEntries.periodStart} >= ${`${filters.year}-01-01`}::date` : undefined,
    filters.year ? sql`${emissionEntries.periodStart} < ${`${filters.year + 1}-01-01`}::date` : undefined,
    filters.status ? eq(emissionEntries.status, filters.status) : undefined,
    filters.scope ? eq(emissionEntries.scope, filters.scope) : undefined,
    filters.sourceId ? eq(emissionEntries.sourceId, filters.sourceId) : undefined,
    filters.importId ? eq(emissionEntries.importId, filters.importId) : undefined,
    filters.createdBy ? eq(emissionEntries.createdBy, filters.createdBy) : undefined,
  ]
}

export async function listEntries(
  db: Database,
  companyId: string,
  filters: EntryFilters,
  { limit, cursor }: { limit: number; cursor: Cursor | null },
) {
  const conditions = filterConditions(companyId, filters)
  const after = cursor
    ? sql`(${emissionEntries.periodStart}, ${emissionEntries.createdAt}, ${emissionEntries.id}) < (${cursor[0]}::date, ${cursor[1]}::timestamptz, ${cursor[2]}::uuid)`
    : undefined

  const [rows, total] = await Promise.all([
    selectEntries(db)
      .where(and(...conditions, after))
      .orderBy(sql`${emissionEntries.periodStart} desc, ${emissionEntries.createdAt} desc, ${emissionEntries.id} desc`)
      .limit(limit + 1),
    // Only the first page counts the matches
    cursor
      ? Promise.resolve(null)
      : db
          .select({ total: count() })
          .from(emissionEntries)
          .where(and(...conditions))
          .then(([row]) => row.total),
  ])
  const page = rows.slice(0, limit)
  return { page, nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null, total }
}

/**
 * How many entries have each status (for the status tabs and the "waiting for
 * verification" badge). One grouped count, served by the company + period index.
 */
export async function statusCounts(db: Database, companyId: string, filters: Pick<EntryFilters, 'year' | 'scope' | 'importId'>) {
  const rows = await db
    .select({ status: emissionEntries.status, entries: count() })
    .from(emissionEntries)
    .where(and(...filterConditions(companyId, filters)))
    .groupBy(emissionEntries.status)
  const counts = Object.fromEntries(ENTRY_STATUSES.map((status) => [status, 0])) as Record<EntryStatus, number>
  for (const row of rows) counts[row.status as EntryStatus] = row.entries
  return counts
}

export async function findEntry(db: Database, companyId: string, entryId: string) {
  const [row] = await selectEntries(db)
    .where(and(eq(emissionEntries.organizationId, companyId), eq(emissionEntries.id, entryId)))
    .limit(1)
  return row ?? null
}

export async function entryNotes(db: Database, entryId: string) {
  const [row] = await db.select({ notes: emissionEntries.notes }).from(emissionEntries).where(eq(emissionEntries.id, entryId))
  return row?.notes ?? null
}

export async function entryEvents(db: Database, companyId: string, entryId: string) {
  const actor = alias(users, 'actor')
  const rows = await db
    .select({
      action: emissionEntryEvents.action,
      actorId: emissionEntryEvents.actorId,
      actorName: actor.name,
      details: emissionEntryEvents.details,
      createdAt: emissionEntryEvents.createdAt,
    })
    .from(emissionEntryEvents)
    .leftJoin(actor, eq(actor.id, emissionEntryEvents.actorId))
    .where(and(eq(emissionEntryEvents.organizationId, companyId), eq(emissionEntryEvents.entryId, entryId)))
    .orderBy(asc(emissionEntryEvents.createdAt))
  return rows.map((row) => ({
    action: row.action,
    actor: row.actorId ? { id: row.actorId, name: row.actorName ?? 'Former member' } : null,
    details: row.details ?? {},
    createdAt: row.createdAt.toISOString(),
  }))
}

export async function requiresVerification(db: Database, companyId: string) {
  const [row] = await db
    .select({ requireVerification: companySettings.requireVerification })
    .from(companySettings)
    .where(eq(companySettings.organizationId, companyId))
  return row?.requireVerification ?? true // the default for new companies
}

export async function isTrackedSource(db: Database, companyId: string, sourceId: string) {
  const [row] = await db
    .select({ sourceId: companySources.sourceId })
    .from(companySources)
    .where(and(eq(companySources.organizationId, companyId), eq(companySources.sourceId, sourceId)))
  return Boolean(row)
}

/** The factor for a source + unit in a reporting year (with the usual fallback to another year) */
export async function factorFor(db: Database, sourceId: string, unit: string, year: number) {
  const values = (await factorValuesFor(db, [sourceId], year)).get(sourceId) ?? []
  return { factor: values.find((value) => value.unit === unit) ?? null, units: values.map((value) => value.unit) }
}

export async function sourceScope(db: Database, sourceId: string) {
  const [row] = await db.select({ scope: emissionSources.scope }).from(emissionSources).where(eq(emissionSources.id, sourceId))
  return row?.scope ?? null
}

/** kg CO2e, rounded to a millionth of a kg (no float noise in stored totals) */
export const co2eOf = (amount: number, kgCo2ePerUnit: number) => Math.round(amount * kgCo2ePerUnit * 1e6) / 1e6
