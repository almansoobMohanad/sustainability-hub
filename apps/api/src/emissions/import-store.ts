import { randomUUID } from 'node:crypto'
import { alias, and, eq, sql, type Database, type SQL } from '@hub/db'
import { emissionEntries, emissionEntryEvents, emissionImports, emissionSources, users } from '@hub/db/schema'
import type { CheckedEntry } from './import-check'

/*
  Spreadsheet imports: saving one (all its entries in ONE transaction with
  multi-row inserts), the "Recent imports" list, and undo.
*/

/**
 * Entries of an import that a person has verified (verified now, and verified
 * by someone at least once, not only by the company's automatic setting).
 * They make undo impossible: verified data is never deleted in bulk.
 */
const personVerifiedCount = (importId: SQL | typeof emissionImports.id) => sql<number>`(
  select count(*)::int from emission_entries e
   where e.import_id = ${importId}
     and e.status = 'verified'
     and exists (
       select 1 from emission_entry_events v
        where v.entry_id = e.id and v.action = 'verified'
          and coalesce((v.details ->> 'automatic')::boolean, false) = false))`

const creator = alias(users, 'creator')
const undoer = alias(users, 'undoer')

function selectImports(db: Database) {
  return db
    .select({
      id: emissionImports.id,
      fileName: emissionImports.fileName,
      entryCount: emissionImports.entryCount,
      skippedRows: emissionImports.skippedRows,
      createdById: emissionImports.createdBy,
      createdByName: creator.name,
      createdAt: emissionImports.createdAt,
      undoneById: emissionImports.undoneBy,
      undoneByName: undoer.name,
      undoneAt: emissionImports.undoneAt,
      // Only for the rows of one page (at most 10), each served by the import_id index
      remainingEntries: sql<number>`(select count(*)::int from emission_entries e where e.import_id = ${emissionImports.id})`,
      verifiedByPerson: personVerifiedCount(emissionImports.id),
      cursorCreatedAt: sql<string>`${emissionImports.createdAt}::text`,
    })
    .from(emissionImports)
    .leftJoin(creator, eq(creator.id, emissionImports.createdBy))
    .leftJoin(undoer, eq(undoer.id, emissionImports.undoneBy))
}

type ImportRow = Awaited<ReturnType<typeof selectImports>>[number]

export function toImportJson(row: ImportRow) {
  return {
    id: row.id,
    fileName: row.fileName,
    entryCount: row.entryCount,
    skippedRows: row.skippedRows,
    createdBy: row.createdById ? { id: row.createdById, name: row.createdByName ?? 'Former member' } : null,
    createdAt: row.createdAt.toISOString(),
    undoneBy: row.undoneById ? { id: row.undoneById, name: row.undoneByName ?? 'Former member' } : null,
    undoneAt: row.undoneAt?.toISOString() ?? null,
    /** Entries of the import that still exist (people may delete some one by one) */
    remainingEntries: row.remainingEntries,
    verifiedByPerson: row.verifiedByPerson,
  }
}

export async function findImport(db: Database, companyId: string, id: string) {
  const [row] = await selectImports(db).where(and(eq(emissionImports.organizationId, companyId), eq(emissionImports.id, id)))
  return row ?? null
}

/* Keyset pages, newest first: the cursor is the (created_at, id) of the last row sent */
type Cursor = [createdAt: string, id: string]

export function decodeImportCursor(cursor: string): Cursor | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      !Number.isNaN(Date.parse(value[0])) &&
      /^[0-9a-f-]{36}$/i.test(String(value[1]))
    ) {
      return value as Cursor
    }
  } catch {
    // not base64/JSON: invalid
  }
  return null
}

export async function listImports(db: Database, companyId: string, { limit, cursor }: { limit: number; cursor: Cursor | null }) {
  const rows = await selectImports(db)
    .where(
      and(
        eq(emissionImports.organizationId, companyId),
        cursor
          ? sql`(${emissionImports.createdAt}, ${emissionImports.id}) < (${cursor[0]}::timestamptz, ${cursor[1]}::uuid)`
          : undefined,
      ),
    )
    .orderBy(sql`${emissionImports.createdAt} desc, ${emissionImports.id} desc`)
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  return {
    page,
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(JSON.stringify([last.cursorCreatedAt, last.id])).toString('base64url')
        : null,
  }
}

type NewImport = {
  companyId: string
  userId: string
  fileName: string
  rows: { row: number; entry: CheckedEntry }[]
  skippedRows: number
  /** The company setting: entries start Pending, or verified straight away */
  needsVerification: boolean
}

/**
 * Saves an import: the import row, all entries and their "created" events in
 * one transaction, with one multi-row INSERT each (not one per row). All or
 * nothing: a failure part-way leaves no half-imported file behind.
 */
export async function saveImport(db: Database, input: NewImport) {
  const { companyId, userId, fileName, rows, needsVerification } = input
  const now = new Date()
  return db.transaction(async (tx) => {
    const [saved] = await tx
      .insert(emissionImports)
      .values({ organizationId: companyId, fileName, entryCount: rows.length, skippedRows: input.skippedRows, createdBy: userId })
      .returning({ id: emissionImports.id })

    // Ids made here, so each event can point at its entry without reading them back
    const entries = rows.map(({ row, entry }) => ({ id: randomUUID(), row, entry }))
    await tx.insert(emissionEntries).values(
      entries.map(({ id, entry }) => ({
        id,
        organizationId: companyId,
        sourceId: entry.sourceId,
        scope: entry.scope,
        reportingYear: entry.year,
        periodStart: entry.periodStart,
        periodEnd: entry.periodEnd,
        amount: entry.amount,
        unit: entry.unit,
        factorYear: entry.factorYear,
        kgCo2ePerUnit: entry.kgCo2ePerUnit,
        co2eKg: entry.co2eKg,
        dataSource: entry.dataSource,
        notes: entry.notes,
        status: needsVerification ? 'pending' : 'verified',
        reviewedAt: needsVerification ? null : now,
        createdBy: userId,
        importId: saved.id,
      })),
    )
    await tx.insert(emissionEntryEvents).values(
      entries.flatMap(({ id, row, entry }) => [
        {
          organizationId: companyId,
          entryId: id,
          action: 'created',
          actorId: userId,
          details: {
            period: entry.period,
            amount: entry.amount,
            unit: entry.unit,
            co2eKg: entry.co2eKg,
            import: { id: saved.id, fileName, row },
          },
        },
        ...(needsVerification
          ? []
          : [{ organizationId: companyId, entryId: id, action: 'verified', actorId: null, details: { automatic: true } }]),
      ]),
    )
    return saved.id
  })
}

export type UndoResult =
  | { ok: true; deleted: number }
  | { ok: false; reason: 'not_found' | 'already_undone' }
  | { ok: false; reason: 'verified'; verified: number }

/**
 * Undo: deletes the import's remaining entries (one DELETE), records a
 * "deleted" event for each (one multi-row INSERT) and marks the import undone.
 * The import and its entries are locked first, so nobody can verify one of
 * them half-way through.
 */
export async function undoImport(db: Database, companyId: string, importId: string, userId: string): Promise<UndoResult> {
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ undoneAt: emissionImports.undoneAt, fileName: emissionImports.fileName })
      .from(emissionImports)
      .where(and(eq(emissionImports.organizationId, companyId), eq(emissionImports.id, importId)))
      .for('update')
    if (!found) return { ok: false, reason: 'not_found' }
    if (found.undoneAt) return { ok: false, reason: 'already_undone' }

    const entries = await tx
      .select({
        id: emissionEntries.id,
        status: emissionEntries.status,
        source: emissionSources.name,
        periodStart: emissionEntries.periodStart,
        amount: emissionEntries.amount,
        unit: emissionEntries.unit,
        co2eKg: emissionEntries.co2eKg,
      })
      .from(emissionEntries)
      .innerJoin(emissionSources, eq(emissionSources.id, emissionEntries.sourceId))
      .where(and(eq(emissionEntries.organizationId, companyId), eq(emissionEntries.importId, importId)))
      .for('update', { of: emissionEntries })

    const { rows: counted } = await tx.execute<{ verified: number }>(
      sql`select ${personVerifiedCount(sql`${importId}::uuid`)} as verified`,
    )
    const verified = counted[0]?.verified ?? 0
    if (verified > 0) return { ok: false, reason: 'verified', verified }

    if (entries.length > 0) {
      await tx
        .delete(emissionEntries)
        .where(and(eq(emissionEntries.organizationId, companyId), eq(emissionEntries.importId, importId)))
      await tx.insert(emissionEntryEvents).values(
        entries.map((entry) => ({
          organizationId: companyId,
          entryId: null,
          action: 'deleted',
          actorId: userId,
          details: {
            entryId: entry.id,
            source: entry.source,
            status: entry.status,
            period: entry.periodStart.slice(0, 7),
            amount: entry.amount,
            unit: entry.unit,
            co2eKg: entry.co2eKg,
            undoneImport: { id: importId, fileName: found.fileName },
          },
        })),
      )
    }
    await tx
      .update(emissionImports)
      .set({ undoneAt: new Date(), undoneBy: userId })
      .where(eq(emissionImports.id, importId))
    return { ok: true, deleted: entries.length }
  })
}
