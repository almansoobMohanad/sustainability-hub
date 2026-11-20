import { formatNumber } from '@/lib/format'
import type { CheckedRow } from './queries'

/** Counting helpers for the import dialog (kept out of the component files for Fast Refresh) */

export const entriesText = (count: number) => (count === 1 ? '1 entry' : `${formatNumber(count)} entries`)
export const rowsText = (count: number) => (count === 1 ? '1 row' : `${formatNumber(count)} rows`)

export type RowsView = 'all' | 'problems' | 'warnings'

export function checkCounts(rows: CheckedRow[]) {
  const ready = rows.filter((row) => row.entry)
  return {
    ready: ready.length,
    problems: rows.filter((row) => row.problems.length > 0).length,
    warnings: rows.filter((row) => row.warnings.length > 0).length,
    totalKg: ready.reduce((sum, row) => sum + row.entry!.co2eKg, 0),
  }
}
