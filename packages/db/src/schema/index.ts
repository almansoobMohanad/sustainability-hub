/*
  All database tables are defined in this folder and re-exported from here,
  so drizzle-kit (migrations) and the query client see the same schema.

  Empty for now: the first tables arrive with authentication (users, sessions,
  companies), then emissions. Add a file per area, e.g. `auth.ts`, `emissions.ts`,
  and re-export it: `export * from './emissions'`.
*/
export {}
