/*
  All database tables are defined in this folder and re-exported from here,
  so drizzle-kit (migrations) and the query client see the same schema.
  One file per area; re-export each one below.
*/

// Users, sessions, accounts, verification tokens, rate limits (Better Auth)
export * from './auth'
