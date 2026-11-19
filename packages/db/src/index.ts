export { createDb, type Database, type DatabasePool } from './client'
export { DEV_DATABASE_URL } from './dev-database-url'
export { loadFactorLibrary, UK_FACTOR_LIBRARY, type FactorLibraryResult } from './factor-library'
export { runMigrations } from './migrate'

// Drizzle's query helpers, re-exported so apps use the same drizzle-orm copy as
// this package (two copies would break its types). Add more as they're needed.
export { and, asc, count, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
// alias(): the same table twice in one query (e.g. an entry's creator and reviewer)
export { alias } from 'drizzle-orm/pg-core'
