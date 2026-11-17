export { createDb, type Database, type DatabasePool } from './client'
export { DEV_DATABASE_URL } from './dev-database-url'
export { runMigrations } from './migrate'

// Drizzle's query helpers, re-exported so apps use the same drizzle-orm copy as
// this package (two copies would break its types). Add more as they're needed.
export { and, asc, eq, sql } from 'drizzle-orm'
