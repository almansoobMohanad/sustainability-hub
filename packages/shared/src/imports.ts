import { ENTRY_LIMITS, latestReportablePeriod } from './emissions'
import { can, type Role } from './permissions'

/*
  Bulk import of emission entries from a spreadsheet (Excel or CSV).

  The browser reads the file and sends its rows as text/numbers; the API checks
  every row with the functions below and saves all of them in one transaction.
  Kept here so the app (template, column headers) and the API (checks) agree.

  The parsers are forgiving where the meaning is certain ("1,200.5", "Mar 2025",
  "L") and refuse where it isn't ("1.200,5", "01/03/2025", a source name that
  only looks similar): a wrong guess would silently give wrong emissions.
*/

export const IMPORT_LIMITS = {
  /** Data rows per file */
  maxRows: 1000,
  /** File size the app accepts (a 1,000-row sheet is far smaller) */
  maxFileBytes: 5 * 1024 * 1024,
  fileNameLength: 200,
  /** Imports per page of the "Recent imports" list */
  pageSize: 10,
} as const

export const IMPORT_COLUMNS = ['month', 'source', 'amount', 'unit', 'dataSource', 'notes'] as const
export type ImportColumn = (typeof IMPORT_COLUMNS)[number]

/** Headers in the template (any of HEADER_ALIASES is accepted too) */
export const IMPORT_COLUMN_LABELS: Record<ImportColumn, string> = {
  month: 'Month',
  source: 'Source',
  amount: 'Amount',
  unit: 'Unit',
  dataSource: 'Data source',
  notes: 'Notes',
}

export const REQUIRED_IMPORT_COLUMNS: ImportColumn[] = ['month', 'source', 'amount']

/**
 * The longest text the app sends per cell: one character over each limit, so
 * the API can still say "too long" for that row instead of refusing the whole
 * request (and the request size stays bounded).
 */
export const IMPORT_CELL_LIMITS: Record<ImportColumn, number> = {
  month: 40,
  source: 301,
  amount: 40,
  unit: 61,
  dataSource: ENTRY_LIMITS.dataSourceLength + 1,
  notes: ENTRY_LIMITS.notesLength + 1,
}

/** One row as the app sends it; `row` is the spreadsheet's own row number */
export type ImportRowInput = {
  row: number
  month?: string | null
  source?: string | null
  amount?: number | string | null
  unit?: string | null
  dataSource?: string | null
  notes?: string | null
}

const compact = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '')

const HEADER_ALIASES: Record<string, ImportColumn> = {
  month: 'month',
  period: 'month',
  reportingmonth: 'month',
  reportingperiod: 'month',
  date: 'month',
  source: 'source',
  emissionsource: 'source',
  activity: 'source',
  amount: 'amount',
  quantity: 'amount',
  activityamount: 'amount',
  value: 'amount',
  unit: 'unit',
  units: 'unit',
  datasource: 'dataSource',
  evidence: 'dataSource',
  reference: 'dataSource',
  notes: 'notes',
  note: 'notes',
  comment: 'notes',
  comments: 'notes',
}

/** "Data source", "DATA_SOURCE", "Reporting month" -> the column they mean (null = not ours) */
export function columnForHeader(header: string): ImportColumn | null {
  return HEADER_ALIASES[compact(header)] ?? null
}

/**
 * How a source is written in import files: "Fuels · Liquid fuels · Diesel
 * (average biofuel blend)". The category is part of it because names repeat
 * across categories (e.g. "Gaseous fuels · Butane" under Fuels and WTT- fuels);
 * category + name is unique in the library.
 */
export const sourceLabel = (source: { category: string; name: string }) => `${source.category} · ${source.name}`

/** For comparing source names: case, spacing and the separator (· > | •) don't matter */
export function normalizeLabel(text: string) {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s*[·•›>»|]\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim()
}

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string }

/**
 * An amount from a cell: a number, or text like "1200.5", "1,200.5" or
 * "1 200". Comma decimals ("1200,5", "1.200,5") are refused: in a sheet mixing
 * both styles there is no safe way to tell 1,200 from 1.2.
 */
export function parseAmount(value: number | string | null | undefined): Parsed<number> {
  let amount: number
  if (typeof value === 'number') {
    amount = value
  } else {
    const text = (value ?? '').replace(/[\s\u00a0\u202f]/g, '')
    if (text === '') return { ok: false, message: 'Enter the amount' }
    if (/^-/.test(text)) return { ok: false, message: 'The amount must be greater than 0' }
    if (/^\d+,\d{1,2}$/.test(text) || /^\d{1,3}(\.\d{3})+,\d+$/.test(text)) {
      return { ok: false, message: `"${value}": use a dot for decimals, e.g. 1200.5` }
    }
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) amount = Number(text.replaceAll(',', ''))
    else if (/^(\d+\.?\d*|\.\d+)$/.test(text)) amount = Number(text)
    else return { ok: false, message: `"${value}" is not a number` }
  }
  if (!Number.isFinite(amount)) return { ok: false, message: 'The amount is not a number' }
  if (amount <= 0) return { ok: false, message: 'The amount must be greater than 0' }
  if (amount > ENTRY_LIMITS.maxAmount) return { ok: false, message: 'That amount looks too large' }
  return { ok: true, value: amount }
}

/** English and Malay month names (and their usual short forms) -> 1-12 */
const MONTH_NAMES: [number, string[]][] = [
  [1, ['jan', 'january', 'januari']],
  [2, ['feb', 'february', 'februari']],
  [3, ['mar', 'march', 'mac']],
  [4, ['apr', 'april']],
  [5, ['may', 'mei']],
  [6, ['jun', 'june']],
  [7, ['jul', 'july', 'julai']],
  [8, ['aug', 'august', 'ogos', 'ogo']],
  [9, ['sep', 'sept', 'september']],
  [10, ['oct', 'october', 'okt', 'oktober']],
  [11, ['nov', 'november']],
  [12, ['dec', 'december', 'dis', 'disember']],
]
const monthByName = new Map(MONTH_NAMES.flatMap(([month, names]) => names.map((name) => [name, month] as const)))

const twoDigits = (month: number) => String(month).padStart(2, '0')

/**
 * The reporting month from a cell's text: "2025-03", "2025/3", "03/2025",
 * "Mar 2025", "March 2025", "2025-03-15", "15/03/2025". Day-month-year dates
 * where both numbers could be the month ("01/03/2025": 1 March or 3 January?)
 * are refused with a hint instead of guessed. Excel date cells are converted to
 * "YYYY-MM" by the app before they get here.
 */
export function parseMonth(value: string | null | undefined, now = new Date()): Parsed<string> {
  const text = (value ?? '').trim().toLowerCase()
  if (text === '') return { ok: false, message: 'Enter the month' }

  let year: number | undefined
  let month: number | undefined
  let match: RegExpExecArray | null
  if ((match = /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2})(?:[t\s].*)?)?$/.exec(text))) {
    year = Number(match[1])
    month = Number(match[2])
  } else if ((match = /^(\d{1,2})[-/.](\d{4})$/.exec(text))) {
    month = Number(match[1])
    year = Number(match[2])
  } else if ((match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text))) {
    const [first, second] = [Number(match[1]), Number(match[2])]
    year = Number(match[3])
    if (first > 12) month = second // 15/03/2025: day first
    else if (second > 12) month = first // 03/15/2025: month first
    else if (first === second) month = first
    else return { ok: false, message: `"${value}" could be two different months. Write it as ${year}-${twoDigits(second)} or ${year}-${twoDigits(first)}` }
  } else if ((match = /^([a-z]+)\.?[\s\-/,']*(\d{4})$/.exec(text)) || (match = /^(\d{4})[\s\-/]+([a-z]+)\.?$/.exec(text))) {
    const [name, yearText] = /\d/.test(match[1]) ? [match[2], match[1]] : [match[1], match[2]]
    month = monthByName.get(name)
    year = Number(yearText)
    if (!month) return { ok: false, message: `"${value}" is not a month` }
  } else if (/^([a-z]+)[\s\-/,']*\d{2}$|^\d{1,2}[-/.]\d{2}$/.test(text)) {
    return { ok: false, message: `"${value}": write the year with 4 digits, e.g. 2025-03` }
  } else {
    return { ok: false, message: `"${value}" is not a month. Use a month like 2025-03` }
  }

  if (month < 1 || month > 12) return { ok: false, message: `"${value}" is not a month. Use a month like 2025-03` }
  const period = `${year}-${twoDigits(month)}`
  if (year < ENTRY_LIMITS.firstYear) return { ok: false, message: `Months before ${ENTRY_LIMITS.firstYear} can't be reported` }
  if (period > latestReportablePeriod(now)) return { ok: false, message: `${period} is in the future` }
  return { ok: true, value: period }
}

/** Other ways people write the units of the factor library (lower case, single spaces) */
const UNIT_ALIASES: Record<string, string> = {
  l: 'litres',
  ltr: 'litres',
  ltrs: 'litres',
  litre: 'litres',
  liter: 'litres',
  liters: 'litres',
  'kwh gross': 'kWh (Gross CV)',
  'kwh gross cv': 'kWh (Gross CV)',
  'kwh net': 'kWh (Net CV)',
  'kwh net cv': 'kWh (Net CV)',
  m3: 'cubic metres',
  'm³': 'cubic metres',
  'cubic metre': 'cubic metres',
  'cubic meter': 'cubic metres',
  'cubic meters': 'cubic metres',
  kgs: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  t: 'tonnes',
  tonne: 'tonnes',
  'metric tonnes': 'tonnes',
  gigajoule: 'GJ',
  gigajoules: 'GJ',
  kilometre: 'km',
  kilometres: 'km',
  kilometer: 'km',
  kilometers: 'km',
  mile: 'miles',
  pkm: 'passenger.km',
  'passenger km': 'passenger.km',
  'passenger-km': 'passenger.km',
  tkm: 'tonne.km',
  'tonne km': 'tonne.km',
  'tonne-km': 'tonne.km',
  'room night': 'Room per night',
  'room nights': 'Room per night',
  // Not "ml": people mean millilitres by it, the library means million litres
}

/**
 * The library unit meant by a cell, among the units a source has: exact (any
 * case) or a known alias. "kWh" for a source measured only in "kWh (Gross CV)"
 * and "kWh (Net CV)" is refused: those give different results.
 */
export function matchUnit(value: string, available: string[]): Parsed<string> {
  const text = value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
  const exact = available.find((unit) => unit.toLowerCase() === text)
  if (exact) return { ok: true, value: exact }
  const alias = UNIT_ALIASES[text]
  if (alias && available.includes(alias)) return { ok: true, value: alias }
  return { ok: false, message: `"${value}" is not available for this source. Use ${listOr(available)}` }
}

/** "a, b or c" */
export function listOr(items: string[]) {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`
}

export type ImportActions = {
  /** Delete the entries of the import that are still there */
  undo: boolean
  /** Why undo isn't possible (null when it is, or when the person may not undo anyway) */
  undoBlocked: string | null
}

/**
 * Undoing an import (deleting its entries): the person who imported it, or a
 * Manager/Admin; not once a person has verified any of its entries (verified
 * data is never removed in bulk; reopen those first). Entries verified
 * automatically by the company setting don't block it.
 */
export function importActions(
  role: Role | null | undefined,
  userId: string,
  item: { createdById: string | null; undone: boolean; verifiedByPerson: number },
): ImportActions {
  const allowed =
    !item.undone &&
    can(role, 'emissions', 'create') &&
    ((item.createdById !== null && item.createdById === userId) || can(role, 'emissions', 'verify'))
  if (!allowed) return { undo: false, undoBlocked: null }
  if (item.verifiedByPerson > 0) {
    const entries = item.verifiedByPerson === 1 ? '1 entry was' : `${item.verifiedByPerson} entries were`
    return { undo: false, undoBlocked: `${entries} verified since the import. Reopen them first to undo it.` }
  }
  return { undo: true, undoBlocked: null }
}
