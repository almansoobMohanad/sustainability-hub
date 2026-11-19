import { sql, type SQL } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { organizations, users } from './auth'

/*
  Emission factor library.

    factor_libraries   a published family of factors, e.g. "uk-ghg" (UK Government
                       GHG Conversion Factors); publisher + licence live here
    factor_sets        one year of a library (UK 2019 ... UK 2026)
    emission_sources   WHAT is measured ("Diesel (average biofuel blend)"), the same
                       row across all years, so a company's choices and sector
                       templates never have to be redone when a new year arrives
    emission_factors   the value: source x unit x year -> kg CO2e per unit

  Loaded automatically on API startup from packages/db/seed (see
  factor-library.ts); nobody runs an import by hand. Entries (next branch) will
  store the factor value they were calculated with, so loading a corrected file
  never changes past totals.
*/

export const factorLibraries = pgTable('factor_libraries', {
  /** Stable code, e.g. "uk-ghg" */
  code: text().primaryKey(),
  title: text().notNull(),
  publisher: text().notNull(),
  licence: text().notNull(),
  licenceUrl: text().notNull(),
  /** Hash of the loaded sources file (+ storage format); when it changes, sources are reloaded */
  sourcesSha256: text().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const factorSets = pgTable(
  'factor_sets',
  {
    id: uuid().primaryKey().defaultRandom(),
    libraryCode: text()
      .notNull()
      .references(() => factorLibraries.code),
    year: smallint().notNull(),
    /** The publisher's version label, e.g. "v1.1" or "revised" */
    version: text().notNull(),
    sourceUrl: text().notNull(),
    /** Hash of the loaded data; when the seed file changes, this year is reloaded */
    contentSha256: text().notNull(),
    factorCount: integer().notNull(),
    loadedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('factor_sets_library_year_unique').on(table.libraryCode, table.year)],
)

export const emissionSources = pgTable(
  'emission_sources',
  {
    id: uuid().primaryKey().defaultRandom(),
    libraryCode: text()
      .notNull()
      .references(() => factorLibraries.code),
    /** Stable identity inside the library, e.g. "1 > fuels > liquid fuels > diesel (average biofuel blend)" */
    key: text().notNull(),
    scope: smallint().notNull(),
    /** Top level, e.g. "Fuels", "Business travel- air" */
    category: text().notNull(),
    /** The levels below the category, e.g. ["Liquid fuels", "Diesel (average biofuel blend)"] */
    path: text().array().notNull(),
    /** For display and search, e.g. "Liquid fuels · Diesel (average biofuel blend)", "Hotel stay · Malaysia" */
    name: text().notNull(),
    /** The publisher's own order (fuels, then vehicles, ...), for lists */
    sortOrder: integer().notNull(),
    /** Lower-case category + name, kept up to date by Postgres; what search matches against */
    searchText: text()
      .notNull()
      .generatedAlwaysAs((): SQL => sql`lower(category || ' ' || name)`),
  },
  (table) => [
    uniqueIndex('emission_sources_library_key_unique').on(table.libraryCode, table.key),
    /*
      Indexes for the library search (GET /api/v1/emission-sources):
      - lists are ordered and paged by (scope, sort_order) within a library,
        optionally filtered by category: these two serve both cases
      - search ("contains these words", e.g. "diesel van") uses a trigram index:
        a normal b-tree can't answer LIKE '%word%', pg_trgm's GIN index can
    */
    index('emission_sources_library_scope_order_idx').on(table.libraryCode, table.scope, table.sortOrder),
    index('emission_sources_library_category_order_idx').on(
      table.libraryCode,
      table.category,
      table.scope,
      table.sortOrder,
    ),
    index('emission_sources_search_trgm_idx').using('gin', table.searchText.op('gin_trgm_ops')),
    check('emission_sources_scope_check', sql`${table.scope} between 1 and 3`),
  ],
)

export const emissionFactors = pgTable(
  'emission_factors',
  {
    id: uuid().primaryKey().defaultRandom(),
    factorSetId: uuid()
      .notNull()
      .references(() => factorSets.id),
    sourceId: uuid()
      .notNull()
      .references(() => emissionSources.id),
    /** e.g. "litres", "kWh (Gross CV)", "passenger.km" */
    unit: text().notNull(),
    kgCo2ePerUnit: numeric({ mode: 'number' }).notNull(),
  },
  (table) => [
    // Also serves "the factor for this source + unit, by year" lookups
    uniqueIndex('emission_factors_source_unit_set_unique').on(table.sourceId, table.unit, table.factorSetId),
    index('emission_factors_set_idx').on(table.factorSetId),
  ],
)

/*
  Per-company settings that aren't part of Better Auth's organizations table
  (kept separate so that generated table stays untouched).
*/
export const companySettings = pgTable('company_settings', {
  organizationId: uuid()
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  /** One of SECTORS in @hub/shared/sectors; null until chosen */
  sector: text(),
  /** New entries start Pending and need a Manager/Admin to verify them (false: verified automatically) */
  requireVerification: boolean().notNull().default(true),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

/*
  The emission sources a company tracks: what the Add emissions picker offers.
  Filled from a sector template when the company is created, then edited on the
  Emission sources page.
*/
export const companySources = pgTable(
  'company_sources',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    sourceId: uuid()
      .notNull()
      .references(() => emissionSources.id),
    /** Unit offered first when entering data (e.g. litres for diesel); null = the first available */
    defaultUnit: text(),
    addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    addedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.sourceId] })],
)
