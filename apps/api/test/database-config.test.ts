import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { databaseConfigProblem, databaseLabel, describeDatabase, readCaCertificate } from '../src/database-config'

/*
  Which database the API is about to use, and the settings it refuses for
  Supabase (no certificate, transaction pooler). Pure functions: no database.
*/

const LOCAL = 'postgres://hub:hub@127.0.0.1:5432/sustainability_hub'
const SESSION = 'postgresql://postgres.abcdefgh:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const TRANSACTION = 'postgresql://postgres.abcdefgh:secret@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres'
const DIRECT = 'postgresql://postgres:secret@db.abcdefgh.supabase.co:5432/postgres'
const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n'

describe('describeDatabase', () => {
  test('tells local, Supabase (and which connection) and other servers apart', () => {
    expect(describeDatabase(LOCAL)).toMatchObject({ kind: 'local', database: 'sustainability_hub' })
    expect(describeDatabase(SESSION)).toMatchObject({ kind: 'supabase', supabaseConnection: 'session pooler', port: 5432 })
    expect(describeDatabase(TRANSACTION)).toMatchObject({ kind: 'supabase', supabaseConnection: 'transaction pooler' })
    expect(describeDatabase(DIRECT)).toMatchObject({ kind: 'supabase', supabaseConnection: 'direct' })
    expect(describeDatabase('postgres://u:p@db.example.com/app')).toMatchObject({ kind: 'other', port: 5432 })
  })

  test('the startup label never shows the user name or password', () => {
    const label = databaseLabel(describeDatabase(SESSION))
    expect(label).toBe('Supabase, session pooler (aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres)')
    expect(label).not.toContain('secret')
    expect(label).not.toContain('abcdefgh:')
  })
})

describe('databaseConfigProblem', () => {
  test('Supabase needs the CA certificate and the session pooler', () => {
    expect(databaseConfigProblem(describeDatabase(SESSION), { hasCaCertificate: false })).toMatch(/DATABASE_CA_CERT/)
    expect(databaseConfigProblem(describeDatabase(TRANSACTION), { hasCaCertificate: true })).toMatch(/port 6543/)
    expect(databaseConfigProblem(describeDatabase(SESSION), { hasCaCertificate: true })).toBeNull()
    expect(databaseConfigProblem(describeDatabase(DIRECT), { hasCaCertificate: true })).toBeNull()
  })

  test('short-lived functions (Vercel) may use the transaction pooler, still with the certificate', () => {
    const serverless = { hasCaCertificate: true, serverless: true }
    expect(databaseConfigProblem(describeDatabase(TRANSACTION), serverless)).toBeNull()
    expect(databaseConfigProblem(describeDatabase(TRANSACTION), { ...serverless, hasCaCertificate: false })).toMatch(/DATABASE_CA_CERT/)
  })

  test('the local database needs neither', () => {
    expect(databaseConfigProblem(describeDatabase(LOCAL), { hasCaCertificate: false })).toBeNull()
  })
})

describe('readCaCertificate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-ca-'))

  test('reads a file (relative to the API folder) or takes the PEM text itself', () => {
    writeFileSync(join(dir, 'ca.crt'), PEM)
    expect(readCaCertificate('./ca.crt', dir)).toBe(PEM)
    expect(readCaCertificate(PEM)).toBe(PEM)
    // Hosts that store settings on one line: "\n" written as backslash-n
    expect(readCaCertificate(PEM.replaceAll('\n', '\\n'))).toBe(PEM)
    expect(readCaCertificate(undefined)).toBeUndefined()
  })

  test('says clearly when the file is missing or is not a certificate', () => {
    expect(() => readCaCertificate('./missing.crt', dir)).toThrow(/no file at/)
    writeFileSync(join(dir, 'notes.txt'), 'hello')
    expect(() => readCaCertificate('./notes.txt', dir)).toThrow(/not a PEM certificate/)
  })
})
