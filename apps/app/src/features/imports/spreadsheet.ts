import type { CellObject, WorkBook, WorkSheet } from 'xlsx'
import {
  IMPORT_CELL_LIMITS,
  IMPORT_COLUMNS,
  IMPORT_COLUMN_LABELS,
  IMPORT_LIMITS,
  REQUIRED_IMPORT_COLUMNS,
  columnForHeader,
  listOr,
  sourceLabel,
  type ImportColumn,
  type ImportRowInput,
} from '@hub/shared/imports'
import type { CompanySource } from '@/features/factors/queries'
import { formatNumber } from '@/lib/format'
import type { CheckedRow } from './queries'

/*
  Spreadsheets in the browser, with SheetJS. It's loaded only when a file is
  read or written (import('xlsx')), so other pages don't download it.

  Reading turns the sheet into rows of plain text/numbers for the API, which
  does every check. Only what needs the spreadsheet itself happens here: finding
  the header row, Excel date cells -> "YYYY-MM", and the spreadsheet's own row
  numbers (blank rows are skipped but never renumber the others).
*/

const loadSheetJs = () => import('xlsx')

/** A problem with the file as a whole (shown at the file picker, nothing is checked) */
export class ImportFileError extends Error {}

export type ImportFile = {
  fileName: string
  sheetName: string
  rows: ImportRowInput[]
  /** Headers that aren't ours (e.g. a "Problems" column from our own download): ignored */
  ignoredHeaders: string[]
  /** Rows with no amount, data source or notes: not filled in (the template lists every source) */
  unfilledRows: number
}

/** The template's extra column (a hint for people, not imported) */
const UNITS_HEADER = 'Available units'
const isTemplateHint = (header: string) => header.trim().toLowerCase() === UNITS_HEADER.toLowerCase()

const ACCEPTED = ['xlsx', 'xlsm', 'xls', 'csv']
export const ACCEPT_ATTRIBUTE = '.xlsx,.xlsm,.xls,.csv'

/** CSV text: UTF-8 (with or without BOM), else Windows-1252 (Excel's "CSV" on many PCs) */
function decodeCsv(buffer: ArrayBuffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

const pad = (month: number) => String(month).padStart(2, '0')

export async function readImportFile(file: File): Promise<ImportFile> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ACCEPTED.includes(extension)) throw new ImportFileError('Choose an Excel (.xlsx) or CSV file.')
  if (file.size === 0) throw new ImportFileError('This file is empty.')
  if (file.size > IMPORT_LIMITS.maxFileBytes) {
    throw new ImportFileError(`This file is larger than ${IMPORT_LIMITS.maxFileBytes / 1024 / 1024} MB. Import up to ${formatNumber(IMPORT_LIMITS.maxRows)} rows at a time.`)
  }

  const XLSX = await loadSheetJs()
  let workbook: WorkBook
  try {
    const buffer = await file.arrayBuffer()
    workbook =
      extension === 'csv'
        ? // raw: every CSV cell stays text ("2025-03" must not become a date with a time zone)
          XLSX.read(decodeCsv(buffer), { type: 'string', raw: true })
        : // cellNF: keep number formats, to recognise date cells; no formulas/HTML needed
          XLSX.read(buffer, { type: 'array', cellNF: true, cellDates: false, cellFormula: false, cellHTML: false })
  } catch {
    throw new ImportFileError("This file couldn't be read. If it has a password, remove it; or save it again as .xlsx or .csv.")
  }

  // The "Entries" sheet of our template, otherwise the first sheet
  const sheetName = workbook.SheetNames.find((name) => name.trim().toLowerCase() === 'entries') ?? workbook.SheetNames[0]
  const sheet: WorkSheet | undefined = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet?.['!ref']) throw new ImportFileError('This file is empty.')
  const range = XLSX.utils.decode_range(sheet['!ref'])
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904)
  const cellAt = (row: number, column: number) => sheet[XLSX.utils.encode_cell({ r: row, c: column })] as CellObject | undefined

  // The header row: the first of the top 20 rows with at least two of our column names
  let headerRow = -1
  let columns = new Map<number, ImportColumn>()
  let ignoredHeaders: string[] = []
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 19) && headerRow < 0; r++) {
    const found = new Map<number, ImportColumn>()
    const others: string[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const text = textOf(cellAt(r, c))
      if (!text) continue
      const column = columnForHeader(text)
      if (column && ![...found.values()].includes(column)) found.set(c, column)
      else if (!isTemplateHint(text)) others.push(text)
    }
    if (found.size >= 2) [headerRow, columns, ignoredHeaders] = [r, found, others]
  }
  if (headerRow < 0) {
    throw new ImportFileError(`No header row found. The first row needs the column names ${listOr(REQUIRED_IMPORT_COLUMNS.map((c) => IMPORT_COLUMN_LABELS[c]))} (download the template to start).`)
  }
  const missing = REQUIRED_IMPORT_COLUMNS.filter((column) => ![...columns.values()].includes(column))
  if (missing.length > 0) {
    const names = missing.map((column) => `"${IMPORT_COLUMN_LABELS[column]}"`)
    throw new ImportFileError(`The ${listOr(names)} column${missing.length > 1 ? 's are' : ' is'} missing (row ${headerRow + 1} has the column names).`)
  }

  const rows: ImportRowInput[] = []
  let unfilledRows = 0
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const row: ImportRowInput = { row: r + 1 } // Excel's row numbers start at 1
    let empty = true
    for (const [c, column] of columns) {
      const cell = cellAt(r, c)
      const value =
        column === 'month' ? monthOf(cell, XLSX.SSF, date1904) : column === 'amount' && cell?.t === 'n' ? (cell.v as number) : textOf(cell)
      if (value === null || value === '') continue
      empty = false
      // Only Amount can be a number here (monthOf/textOf give text)
      const cells = row as Record<ImportColumn, string | number | null | undefined>
      cells[column] = typeof value === 'string' ? value.slice(0, IMPORT_CELL_LIMITS[column]) : value
    }
    if (empty) continue // blank rows (and rows with only other columns filled) are skipped
    // The template lists every source with its month and unit; the ones without an amount
    // (and nothing else typed in) weren't filled in. Counted and shown, never imported.
    if (row.amount === undefined && row.dataSource === undefined && row.notes === undefined) {
      unfilledRows++
      continue
    }
    rows.push(row)
    if (rows.length > IMPORT_LIMITS.maxRows) {
      throw new ImportFileError(`This file has more than ${formatNumber(IMPORT_LIMITS.maxRows)} rows. Split it into smaller files and import them one by one.`)
    }
  }
  if (rows.length === 0) {
    throw new ImportFileError(
      unfilledRows > 0
        ? 'No amounts filled in yet. Enter the amount for each source you want to import.'
        : `No entries below the column names (row ${headerRow + 1}).`,
    )
  }
  return { fileName: file.name, sheetName, rows, ignoredHeaders, unfilledRows }
}

/** A cell as people see it: text as is, numbers as formatted in the sheet */
function textOf(cell: CellObject | undefined): string | null {
  if (!cell || cell.v === undefined || cell.v === null) return null
  if (cell.t === 's') return String(cell.v).trim()
  return (cell.w ?? String(cell.v)).trim()
}

type Ssf = typeof import('xlsx').SSF

/** Excel date cells -> "YYYY-MM" (from the stored date, not the display: no time-zone shifts); text as is */
function monthOf(cell: CellObject | undefined, ssf: Ssf, date1904: boolean): string | null {
  if (cell?.t === 'n' && typeof cell.v === 'number' && cell.z !== undefined && ssf.is_date(cell.z)) {
    const date = ssf.parse_date_code(cell.v, { date1904 })
    return `${date.y}-${pad(date.m)}`
  }
  return textOf(cell)
}

/** Last month as "YYYY-MM": what people usually report (their bills arrive after the month) */
function lastMonth(now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

/**
 * The template: the "Entries" sheet already lists every source the company
 * tracks (last month, the exact source name, its usual unit, and the other
 * units it can be measured in), so people only type the amounts. Rows left
 * without an amount are not imported. Plus the "Help" sheet.
 */
export async function downloadTemplate(sources: CompanySource[]) {
  const XLSX = await loadSheetJs()
  const workbook = XLSX.utils.book_new()
  const month = lastMonth()

  const header = [...IMPORT_COLUMNS.map((column) => IMPORT_COLUMN_LABELS[column]), UNITS_HEADER]
  const rows = sources.map((source) => {
    const units = source.factors.map((factor) => factor.unit)
    const unit = source.defaultUnit && units.includes(source.defaultUnit) ? source.defaultUnit : (units[0] ?? '')
    return [month, sourceLabel(source), null, unit, null, null, units.join(', ')]
  })
  const entries = XLSX.utils.aoa_to_sheet([header, ...rows])
  entries['!cols'] = [{ wch: 10 }, { wch: 70 }, { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 30 }, { wch: 50 }]
  // Month as text, so Excel keeps "2026-10" as typed instead of turning it into a date
  for (let r = 1; r <= rows.length; r++) {
    const cell = entries[XLSX.utils.encode_cell({ r, c: 0 })] as CellObject | undefined
    if (cell) cell.z = '@'
  }
  XLSX.utils.book_append_sheet(workbook, entries, 'Entries')

  const help = XLSX.utils.aoa_to_sheet([
    ['How to fill in the Entries sheet'],
    [],
    ['', 'The sheet lists every source your company tracks. Type the Amount for the ones you used.'],
    ['', 'Rows without an amount are not imported, so you can leave the others empty.'],
    ['', 'For more months or several bills, copy a row and change the Month or Amount.'],
    [],
    ['Month', 'The reporting month, e.g. 2025-03 or Mar 2025 (or an Excel date).'],
    ['Source', "Keep the name as it is. It must be one of your company's sources (see Emission sources in the app)."],
    ['Amount', 'A number greater than 0, with a dot for decimals, e.g. 1200.5.'],
    ['Unit', 'Filled in with the usual unit. You can change it to another one from "Available units".'],
    ['Data source', 'Optional: where the number comes from, e.g. an invoice or meter reading.'],
    ['Notes', 'Optional.'],
    [],
    ['', `Up to ${formatNumber(IMPORT_LIMITS.maxRows)} rows per file. Every row is checked before anything is saved.`],
  ])
  help['!cols'] = [{ wch: 14 }, { wch: 100 }]
  XLSX.utils.book_append_sheet(workbook, help, 'Help')

  XLSX.writeFile(workbook, 'emissions-import-template.xlsx', { compression: true })
}

/**
 * The rows read from a file, with the check's problems and warnings in extra
 * columns, to fix in Excel and upload again (our extra columns are ignored then).
 */
export async function downloadCheckedRows(file: ImportFile, checked: CheckedRow[], { onlyProblems }: { onlyProblems: boolean }) {
  const XLSX = await loadSheetJs()
  const byRow = new Map(checked.map((row) => [row.row, row]))
  const header = [...IMPORT_COLUMNS.map((column) => IMPORT_COLUMN_LABELS[column]), 'Problems', 'Warnings', 'Original row']
  const lines = file.rows
    .filter((row) => !onlyProblems || (byRow.get(row.row)?.problems.length ?? 0) > 0)
    .map((row) => {
      const result = byRow.get(row.row)
      const notes = (list: CheckedRow['problems'] | undefined) =>
        (list ?? []).map((note) => (note.column ? `${IMPORT_COLUMN_LABELS[note.column]}: ${note.message}` : note.message)).join('\n')
      return [...IMPORT_COLUMNS.map((column) => row[column] ?? ''), notes(result?.problems), notes(result?.warnings), row.row]
    })
  const sheet = XLSX.utils.aoa_to_sheet([header, ...lines])
  sheet['!cols'] = [{ wch: 12 }, { wch: 60 }, { wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 30 }, { wch: 60 }, { wch: 40 }, { wch: 12 }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Entries')
  const base = file.fileName.replace(/\.[^.]+$/, '')
  XLSX.writeFile(workbook, `${base} - ${onlyProblems ? 'skipped rows' : 'problems marked'}.xlsx`, { compression: true })
}
