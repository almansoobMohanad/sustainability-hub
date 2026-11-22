import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/*
  Which database the API talks to, said in plain words at startup, and the
  settings that would make a hosted database unsafe or broken, refused before
  connecting:
  - Supabase without its CA certificate: either unencrypted over the internet,
    or failing with "self-signed certificate in certificate chain".
  - Supabase's transaction pooler (port 6543) for a server that stays running
    or for migrations: it hands the connection to someone else after every
    transaction, which breaks session state (migrations, the factor library's
    one-time load). Those use the session pooler (port 5432).
    Short-lived functions (Vercel) are the exception: they SHOULD use the
    transaction pooler, which shares a few database connections between many
    function instances; every request's queries are single statements or
    transactions, which it handles fine.
*/

export type DatabaseTarget = {
  kind: 'local' | 'supabase' | 'other'
  host: string
  port: number
  database: string
  /** Supabase only: which way in */
  supabaseConnection?: 'session pooler' | 'transaction pooler' | 'direct'
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres'])

export function describeDatabase(connectionString: string): DatabaseTarget {
  const url = new URL(connectionString)
  const host = url.hostname
  const port = Number(url.port || 5432)
  const database = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres'
  if (LOCAL_HOSTS.has(host)) return { kind: 'local', host, port, database }
  if (host.endsWith('.pooler.supabase.com')) {
    return { kind: 'supabase', host, port, database, supabaseConnection: port === 6543 ? 'transaction pooler' : 'session pooler' }
  }
  if (host.endsWith('.supabase.co')) return { kind: 'supabase', host, port, database, supabaseConnection: 'direct' }
  return { kind: 'other', host, port, database }
}

/** One line for the startup log (never the user name or password) */
export function databaseLabel(target: DatabaseTarget) {
  const where = `${target.host}:${target.port}/${target.database}`
  if (target.kind === 'local') return `local (${where})`
  if (target.kind === 'supabase') return `Supabase, ${target.supabaseConnection} (${where})`
  return where
}

/** A setting that must be fixed before starting, or null */
export function databaseConfigProblem(
  target: DatabaseTarget,
  { hasCaCertificate, serverless = false }: { hasCaCertificate: boolean; serverless?: boolean },
) {
  if (target.kind !== 'supabase') return null
  if (target.supabaseConnection === 'transaction pooler' && !serverless) {
    return (
      'DATABASE_URL uses Supabase\'s transaction pooler (port 6543). Use the "Session pooler" connection ' +
      'string instead (port 5432): Supabase dashboard > Connect.'
    )
  }
  if (!hasCaCertificate) {
    return (
      'Supabase needs DATABASE_CA_CERT, so the connection is encrypted and the server is really Supabase. ' +
      'Download the certificate (Supabase dashboard > Project Settings > Database > SSL Configuration) and set ' +
      'DATABASE_CA_CERT to the file, e.g. DATABASE_CA_CERT=./supabase-ca.crt'
    )
  }
  return null
}

/** What to check when the database doesn't answer, for this kind of database */
export function unreachableHint(target: DatabaseTarget) {
  if (target.kind === 'local') return 'Is it running? Start it with:  pnpm db:up   (Docker Desktop must be open)'
  if (target.kind === 'supabase') {
    return [
      'Check in the Supabase dashboard:',
      '- Is the project paused? Free projects pause after a week without use: resume it there.',
      '- Is the password in DATABASE_URL right?',
      target.supabaseConnection === 'direct'
        ? '- Direct connections (db.<project>.supabase.co) need IPv6: use the "Session pooler" string instead.'
        : '- Is DATABASE_CA_CERT the certificate of THIS project?',
    ].join('\n')
  }
  return 'Check DATABASE_URL and that the database server accepts connections from here.'
}

/**
 * DATABASE_CA_CERT is either the certificate itself (PEM text, handy on hosts
 * where settings are text only) or a path to the file (relative paths start at
 * the API's folder, where `pnpm dev` runs).
 */
export function readCaCertificate(value: string | undefined, baseDir = process.cwd()) {
  if (!value) return undefined
  if (value.includes('-----BEGIN CERTIFICATE-----')) return value.replace(/\\n/g, '\n')
  const path = resolve(baseDir, value)
  if (!existsSync(path)) throw new Error(`DATABASE_CA_CERT: no file at ${path}`)
  const text = readFileSync(path, 'utf8')
  if (!text.includes('-----BEGIN CERTIFICATE-----')) throw new Error(`DATABASE_CA_CERT: ${path} is not a PEM certificate`)
  return text
}
