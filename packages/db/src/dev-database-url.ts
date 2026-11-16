/**
 * The local development database from docker-compose.yml.
 * Only used when DATABASE_URL isn't set, and never in production
 * (the API refuses to start in production without DATABASE_URL).
 */
export const DEV_DATABASE_URL = 'postgres://hub:hub@127.0.0.1:5432/sustainability_hub'
