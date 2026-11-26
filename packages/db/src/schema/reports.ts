import { sql } from 'drizzle-orm'
import { check, index, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { organizations, users } from './auth'

/*
  Disclosure reports. Today: SEDG (Capital Markets Malaysia's Simplified ESG
  Disclosure Guide), one per company per calendar year. The fields are defined
  in @hub/shared/sedg; `answers` holds only what people entered, by field key
  (a figure calculated from the company's entries is NOT stored: it's worked
  out when the report is read, so it always matches the verified entries,
  until someone enters their own value, which then wins).
*/
export const sedgReports = pgTable(
  'sedg_reports',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    year: smallint().notNull(),
    /** basic | intermediate | advanced (which disclosures the report includes) */
    level: text().notNull().default('basic'),
    /** { [fieldKey]: number | string }, validated by the API against @hub/shared/sedg */
    answers: jsonb().$type<Record<string, string | number>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** The last change (a field or the level) and who made it */
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    uniqueIndex('sedg_reports_company_year_unique').on(table.organizationId, table.year),
    check('sedg_reports_level_check', sql`${table.level} in ('basic', 'intermediate', 'advanced')`),
    check('sedg_reports_year_check', sql`${table.year} between 1990 and 2100`),
  ],
)

/*
  The report's history: who changed what and when. Autosave sends a change a
  moment after someone stops typing, so one row per save would flood this
  table; instead a person's saves within 15 minutes of each other are merged
  into one row ("Aisyah edited E2.1, E3.1 between 14:05 and 14:20").
*/
export const sedgReportEdits = pgTable(
  'sedg_report_edits',
  {
    id: uuid().primaryKey().defaultRandom(),
    reportId: uuid()
      .notNull()
      .references(() => sedgReports.id, { onDelete: 'cascade' }),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** What changed: disclosure codes ("E2.1"), "General" or "Level" */
    changed: text().array().notNull(),
  },
  (table) => [
    // The history list (newest first, keyset pages) and "this person's last edit" (to merge into)
    index('sedg_report_edits_report_idx').on(table.reportId, table.endedAt.desc(), table.id.desc()),
  ],
)
