import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { organizations, users } from './auth'
import { emissionSources } from './factors'

/*
  Emission entries: one activity (e.g. 3,200 litres of diesel in March 2026) of
  one company, with the emissions calculated from it.

  Lessons from the old app built in (see AGENTS.md): a numeric reporting year
  and real period dates instead of a "2024-03" string filtered with LIKE,
  indexes that match the lists and dashboard queries, and totals computed in
  SQL. Every query filters by organization_id first.
*/

export const emissionEntries = pgTable(
  'emission_entries',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    sourceId: uuid()
      .notNull()
      .references(() => emissionSources.id),
    /** Copied from the source, so totals per scope need no join */
    scope: smallint().notNull(),
    reportingYear: smallint().notNull(),
    /** The reporting period (a calendar month today; quarters/years later need no migration) */
    periodStart: date({ mode: 'string' }).notNull(),
    periodEnd: date({ mode: 'string' }).notNull(),
    amount: numeric({ mode: 'number' }).notNull(),
    unit: text().notNull(),
    /*
      The factor used, kept with the entry: loading new or corrected factors
      never changes past totals. factorYear can differ from reportingYear when
      that year's factors aren't published yet (the latest earlier year is used).
    */
    factorYear: smallint().notNull(),
    kgCo2ePerUnit: numeric({ mode: 'number' }).notNull(),
    /** amount x kgCo2ePerUnit, calculated by the API (never trusted from the browser) */
    co2eKg: numeric({ mode: 'number' }).notNull(),
    dataSource: text(),
    notes: text(),
    /** pending | verified | rejected (see @hub/shared/emissions) */
    status: text().notNull(),
    rejectionReason: text(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    /** Who verified or rejected it (null for automatic verification) */
    reviewedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp({ withTimezone: true }),
    /** The spreadsheet import it came from (null: added with the form) */
    importId: uuid().references(() => emissionImports.id, { onDelete: 'set null' }),
  },
  (table) => [
    /*
      The main index: the entries list (newest period first, keyset pages on
      period_start, created_at, id), year filters (a period_start range) and
      the dashboard sums (one or two years of one company) all use it.
    */
    index('emission_entries_company_period_idx').on(
      table.organizationId,
      table.periodStart.desc(),
      table.createdAt.desc(),
      table.id.desc(),
    ),
    // The verification queue: only Pending entries, so it stays small however many entries exist
    index('emission_entries_company_pending_idx')
      .on(table.organizationId, table.periodStart.desc(), table.createdAt.desc(), table.id.desc())
      .where(sql`${table.status} = 'pending'`),
    // "Entries from this import" and undoing an import; most entries have no import, so partial
    index('emission_entries_import_idx')
      .on(table.importId)
      .where(sql`${table.importId} is not null`),
    check('emission_entries_status_check', sql`${table.status} in ('pending', 'verified', 'rejected')`),
    check('emission_entries_scope_check', sql`${table.scope} between 1 and 3`),
    check('emission_entries_amount_check', sql`${table.amount} > 0`),
    check('emission_entries_period_check', sql`${table.periodEnd} >= ${table.periodStart}`),
  ],
)

/*
  Spreadsheet imports: who imported which file and when, so the entries of one
  import can be listed together and the whole import undone (its entries
  deleted, with an audit event each). The row stays after an undo (undone_at).
*/
export const emissionImports = pgTable(
  'emission_imports',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    fileName: text().notNull(),
    /** Entries created */
    entryCount: integer().notNull(),
    /** Rows with problems that the person chose to skip */
    skippedRows: integer().notNull().default(0),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    undoneBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    undoneAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    // The "Recent imports" list: newest first, keyset pages on (created_at, id)
    index('emission_imports_company_created_idx').on(table.organizationId, table.createdAt.desc(), table.id.desc()),
  ],
)

/*
  Audit trail: who did what to an entry, and when. Events outlive their entry
  (entry_id becomes null when it's deleted; `details` keeps what it was), so
  deletions stay visible.
*/
export const emissionEntryEvents = pgTable(
  'emission_entry_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    entryId: uuid().references(() => emissionEntries.id, { onDelete: 'set null' }),
    /** created | updated | verified | rejected | reopened | deleted */
    action: text().notNull(),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** e.g. changed fields, rejection reason, { automatic: true }, or the deleted entry */
    details: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('emission_entry_events_entry_idx').on(table.entryId, table.createdAt),
    index('emission_entry_events_company_idx').on(table.organizationId, table.createdAt.desc()),
  ],
)
