import { eq, sql, type Database } from '@hub/db'
import { companySources, emissionSources } from '@hub/db/schema'
import { ENTRY_LIMITS, latestReportablePeriod, periodBounds } from '@hub/shared/emissions'
import {
  listOr,
  matchUnit,
  normalizeLabel,
  parseAmount,
  parseMonth,
  sourceLabel,
  type ImportColumn,
  type ImportRowInput,
} from '@hub/shared/imports'
import { factorValuesFor, type FactorValue } from '../factors/factor-values'
import { co2eOf } from './entry-store'

/*
  Checks the rows of a spreadsheet import, all of them, and reports every
  problem with its row and column. Nothing is saved here; the import route
  saves the checked entries in one transaction.

  Database work is the same whatever the number of rows (no query per row,
  the old app's mistake):
    1. the company's sources (at most 300), to match the names in the file
    2. the factors, one query per reporting year in the file
    3. one query for entries that already exist (duplicate warnings)
    4. only if some names are unknown: one query to tell "not in the library"
       from "in the library, but your company doesn't track it"
*/

export type RowNote = { column: ImportColumn | null; message: string }

export type CheckedEntry = {
  sourceId: string
  source: { name: string; category: string }
  scope: number
  period: string
  year: number
  periodStart: string
  periodEnd: string
  amount: number
  unit: string
  factorYear: number
  kgCo2ePerUnit: number
  co2eKg: number
  dataSource: string | null
  notes: string | null
}

export type CheckedRow = {
  row: number
  problems: RowNote[]
  warnings: RowNote[]
  /** Null when the row has problems */
  entry: CheckedEntry | null
}

type TrackedSource = { id: string; scope: number; category: string; name: string; path: string[] }

type SourceMatch = { ok: true; source: TrackedSource } | { ok: false; message: string; unknown?: true }

/**
 * Finds a source by what a person wrote: "Category · Name" (what the template
 * lists), or just the name or its last part ("Diesel (average biofuel blend)")
 * when only one of the company's sources has it. Never a guess between several.
 */
function sourceMatcher(sources: TrackedSource[]) {
  const byLabel = new Map<string, TrackedSource>()
  const byName = new Map<string, TrackedSource[]>()
  const byLastPart = new Map<string, TrackedSource[]>()
  const add = (map: Map<string, TrackedSource[]>, key: string, source: TrackedSource) =>
    map.set(key, [...(map.get(key) ?? []), source])
  for (const source of sources) {
    byLabel.set(normalizeLabel(sourceLabel(source)), source)
    add(byName, normalizeLabel(source.name), source)
    const last = source.path.at(-1) ?? source.name
    add(byLastPart, normalizeLabel(last), source)
  }

  return (text: string): SourceMatch => {
    const key = normalizeLabel(text)
    const exact = byLabel.get(key)
    if (exact) return { ok: true, source: exact }
    for (const map of [byName, byLastPart]) {
      const found = map.get(key) ?? []
      if (found.length === 1) return { ok: true, source: found[0] }
      if (found.length > 1) {
        const options = found.slice(0, 3).map((source) => `"${sourceLabel(source)}"`)
        return {
          ok: false,
          message: `"${text}" matches ${found.length} of your sources. Write it in full, e.g. ${listOr(options)}`,
        }
      }
    }
    return { ok: false, message: '', unknown: true }
  }
}

const words = (text: string) => new Set(normalizeLabel(text).split(/[^a-z0-9]+/).filter((word) => word.length > 1))

/** The same word, or one letter added, removed or changed ("disel" ~ "diesel"), for words of 4+ letters */
export function nearlySame(a: string, b: string) {
  if (a === b) return true
  if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) // one letter changed
  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a]
  return longer.slice(i + 1) === shorter.slice(i) // one letter added or removed
}

/** The company source that shares most words with an unknown name (typos allowed), if clearly the best */
function closestSource(text: string, sources: TrackedSource[]) {
  const wanted = words(text)
  if (wanted.size === 0) return null
  let best: TrackedSource | null = null
  let bestScore = 0
  let tie = false
  for (const source of sources) {
    const have = [...words(sourceLabel(source))]
    const score = [...wanted].filter((word) => have.some((other) => nearlySame(word, other))).length / wanted.size
    if (score > bestScore) [best, bestScore, tie] = [source, score, false]
    else if (score === bestScore) tie = true
  }
  return best && bestScore >= 0.6 && !tie ? best : null
}

const cleanText = (value: string | null | undefined) => {
  const text = value?.trim()
  return text ? text : null
}

export async function checkImportRows(db: Database, companyId: string, rows: ImportRowInput[], now = new Date()) {
  // 1. The company's sources
  const tracked: TrackedSource[] = await db
    .select({
      id: emissionSources.id,
      scope: emissionSources.scope,
      category: emissionSources.category,
      name: emissionSources.name,
      path: emissionSources.path,
    })
    .from(companySources)
    .innerJoin(emissionSources, eq(emissionSources.id, companySources.sourceId))
    .where(eq(companySources.organizationId, companyId))
  const findSource = sourceMatcher(tracked)

  // First pass: everything that needs no factors
  const checked = rows.map((input) => {
    const problems: RowNote[] = []
    const month = parseMonth(input.month, now)
    if (!month.ok) problems.push({ column: 'month', message: month.message })
    const amount = parseAmount(input.amount)
    if (!amount.ok) problems.push({ column: 'amount', message: amount.message })

    const sourceText = cleanText(input.source)
    const match: SourceMatch | null = sourceText ? findSource(sourceText) : null
    if (!sourceText) problems.push({ column: 'source', message: 'Enter the source' })
    else if (match && !match.ok && !match.unknown) problems.push({ column: 'source', message: match.message })

    const dataSource = cleanText(input.dataSource)
    if (dataSource && dataSource.length > ENTRY_LIMITS.dataSourceLength) {
      problems.push({ column: 'dataSource', message: `Keep the data source under ${ENTRY_LIMITS.dataSourceLength} characters` })
    }
    const notes = cleanText(input.notes)
    if (notes && notes.length > ENTRY_LIMITS.notesLength) {
      problems.push({ column: 'notes', message: `Keep the notes under ${ENTRY_LIMITS.notesLength} characters` })
    }
    return {
      input,
      problems,
      sourceText,
      source: match?.ok ? match.source : null,
      unknownSource: Boolean(match && !match.ok && match.unknown),
      period: month.ok ? month.value : null,
      amount: amount.ok ? amount.value : null,
      dataSource,
      notes,
    }
  })

  // 2. Factors: one query per reporting year, for the sources used in that year. A row
  // whose month is wrong still gets its unit checked (against this year's units), so
  // all of its problems show at once.
  const fallbackYear = Number(latestReportablePeriod(now).slice(0, 4))
  const yearOf = (period: string | null) => (period ? Number(period.slice(0, 4)) : fallbackYear)
  const sourcesByYear = new Map<number, Set<string>>()
  for (const row of checked) {
    if (!row.source) continue
    const year = yearOf(row.period)
    sourcesByYear.set(year, (sourcesByYear.get(year) ?? new Set()).add(row.source.id))
  }
  const factorsByYear = new Map<number, Map<string, FactorValue[]>>(
    await Promise.all(
      [...sourcesByYear].map(async ([year, ids]) => [year, await factorValuesFor(db, [...ids], year)] as const),
    ),
  )

  // 4. Unknown names: in the library but not tracked, or a likely typo?
  const unknownNames = [...new Set(checked.filter((row) => row.unknownSource).map((row) => normalizeLabel(row.sourceText!)))]
  const inLibrary = new Set<string>()
  if (unknownNames.length > 0) {
    const found = await db
      .select({ label: sql<string>`lower(${emissionSources.category} || ' · ' || ${emissionSources.name})`, name: sql<string>`lower(${emissionSources.name})` })
      .from(emissionSources)
      .where(
        sql`lower(${emissionSources.category} || ' · ' || ${emissionSources.name}) = any(${toTextArray(unknownNames)}::text[])
            or lower(${emissionSources.name}) = any(${toTextArray(unknownNames)}::text[])`,
      )
    for (const row of found) inLibrary.add(row.label).add(row.name)
  }

  const result: CheckedRow[] = checked.map((row) => {
    const problems = [...row.problems]
    if (row.unknownSource) {
      const name = row.sourceText!
      const closest = closestSource(name, tracked)
      problems.push({
        column: 'source',
        message: inLibrary.has(normalizeLabel(name))
          ? `"${name}" is not one of your company's sources yet. An Admin or Manager can add it on the Emission sources page`
          : closest
            ? `"${name}" is not one of your sources. Did you mean "${sourceLabel(closest)}"?`
            : `"${name}" is not one of your sources. Check the spelling (the template's Sources sheet lists them)`,
      })
    }

    let unit: string | null = null
    let factor: FactorValue | null = null
    if (row.source) {
      const values = factorsByYear.get(yearOf(row.period))?.get(row.source.id) ?? []
      const units = values.map((value) => value.unit)
      const unitText = cleanText(row.input.unit)
      if (values.length === 0) {
        problems.push({ column: 'source', message: 'This source has no emission factor' })
      } else if (!unitText) {
        // Only when there's no choice to make; otherwise the file must say
        if (values.length === 1) [unit, factor] = [values[0].unit, values[0]]
        else problems.push({ column: 'unit', message: `Enter the unit: ${listOr(units)}` })
      } else {
        const matched = matchUnit(unitText, units)
        if (matched.ok) [unit, factor] = [matched.value, values.find((value) => value.unit === matched.value)!]
        else problems.push({ column: 'unit', message: matched.message })
      }
    }

    if (problems.length > 0 || !row.source || !row.period || row.amount === null || !unit || !factor) {
      return { row: row.input.row, problems, warnings: [], entry: null }
    }
    const { year, start, end } = periodBounds(row.period)
    return {
      row: row.input.row,
      problems,
      warnings: [],
      entry: {
        sourceId: row.source.id,
        source: { name: row.source.name, category: row.source.category },
        scope: row.source.scope,
        period: row.period,
        year,
        periodStart: start,
        periodEnd: end,
        amount: row.amount,
        unit,
        factorYear: factor.year,
        kgCo2ePerUnit: factor.kgCo2ePerUnit,
        co2eKg: co2eOf(row.amount, factor.kgCo2ePerUnit),
        dataSource: row.dataSource,
        notes: row.notes,
      },
    }
  })

  await addDuplicateWarnings(db, companyId, result)
  return result
}

const duplicateKey = (entry: CheckedEntry) => `${entry.sourceId}|${entry.periodStart}|${entry.unit}|${entry.amount}`

/**
 * Warnings (not problems: two identical fuel purchases in a month are possible)
 * for rows that repeat an earlier row of the file, or an entry the company
 * already has (rejected entries don't count: they're being replaced).
 */
async function addDuplicateWarnings(db: Database, companyId: string, rows: CheckedRow[]) {
  const firstRow = new Map<string, number>()
  for (const row of rows) {
    if (!row.entry) continue
    const key = duplicateKey(row.entry)
    const first = firstRow.get(key)
    if (first === undefined) firstRow.set(key, row.row)
    else row.warnings.push({ column: null, message: `Same source, month, amount and unit as row ${first}` })
  }

  const valid = rows.filter((row) => row.entry)
  if (valid.length === 0) return
  // 3. One query for all rows: the rows travel as one JSON parameter (not 4 parameters per row)
  const keys = valid.map((row, index) => ({
    i: index,
    source_id: row.entry!.sourceId,
    period_start: row.entry!.periodStart,
    unit: row.entry!.unit,
    amount: row.entry!.amount,
  }))
  const { rows: existing } = await db.execute<{ i: number }>(sql`
    select k.i
      from jsonb_to_recordset(${JSON.stringify(keys)}::jsonb)
           as k(i int, source_id uuid, period_start date, unit text, amount numeric)
     where exists (
       select 1 from emission_entries e
        where e.organization_id = ${companyId}
          and e.period_start = k.period_start
          and e.source_id = k.source_id
          and e.unit = k.unit
          and e.amount = k.amount
          and e.status <> 'rejected')`)
  for (const { i } of existing) {
    valid[i].warnings.push({ column: null, message: 'Your company already has an entry with the same source, month, amount and unit' })
  }
}

/** A Postgres text[] literal, so a list goes as ONE parameter (Drizzle would spread a JS array) */
function toTextArray(values: string[]) {
  return `{${values.map((value) => `"${value.replace(/["\\]/g, (char) => `\\${char}`)}"`).join(',')}}`
}
