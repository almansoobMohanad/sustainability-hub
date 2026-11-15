import type { EmissionEntry, EmissionSource, Scope } from '@/features/emissions/types'

/** Emissions (kg CO2e) per scope. */
export type ScopeTotals = Record<Scope, number>

export type MonthSummary = {
  /** 0-based month index. */
  month: number
  byScope: ScopeTotals
  total: number
  /** False for months with no recorded entries (e.g. not reached yet). */
  hasData: boolean
}

export type YearSummary = {
  year: number
  total: number
  byScope: ScopeTotals
  months: MonthSummary[]
  /** Entries in this year still waiting for a manager to verify them. */
  awaitingVerification: number
  /** Last month (0-based) with data, or -1. */
  lastMonthWithData: number
  /** Same months of the previous year, for a like-for-like comparison. */
  previousYearSamePeriod: { total: number; hasData: boolean }
}

const emptyTotals = (): ScopeTotals => ({ 1: 0, 2: 0, 3: 0 })

/** Years that have at least one entry, newest first. */
export function availableYears(entries: EmissionEntry[]) {
  return [...new Set(entries.map((e) => Number(e.period.slice(0, 4))))].sort((a, b) => b - a)
}

export function summarizeYear(
  entries: EmissionEntry[],
  sources: EmissionSource[],
  year: number,
): YearSummary {
  const scopeOf = new Map(sources.map((s) => [s.id, s.scope]))
  const months: MonthSummary[] = Array.from({ length: 12 }, (_, month) => ({
    month,
    byScope: emptyTotals(),
    total: 0,
    hasData: false,
  }))
  const byScope = emptyTotals()
  let awaitingVerification = 0
  const previousYearByMonth = new Array<number>(12).fill(0)
  const previousYearHasMonth = new Array<boolean>(12).fill(false)

  for (const entry of entries) {
    if (entry.status === 'rejected') continue // rejected data doesn't count
    const entryYear = Number(entry.period.slice(0, 4))
    const month = Number(entry.period.slice(5, 7)) - 1
    const scope = scopeOf.get(entry.sourceId)
    if (!scope) continue

    if (entryYear === year) {
      months[month].byScope[scope] += entry.co2eKg
      months[month].total += entry.co2eKg
      months[month].hasData = true
      byScope[scope] += entry.co2eKg
      if (entry.status === 'unverified') awaitingVerification++
    } else if (entryYear === year - 1) {
      previousYearByMonth[month] += entry.co2eKg
      previousYearHasMonth[month] = true
    }
  }

  const lastMonthWithData = months.findLastIndex((m) => m.hasData)
  // Compare like with like: only the months this year has data for
  let previousTotal = 0
  let previousHasData = lastMonthWithData >= 0
  for (let m = 0; m <= lastMonthWithData; m++) {
    if (!months[m].hasData) continue
    if (!previousYearHasMonth[m]) previousHasData = false
    previousTotal += previousYearByMonth[m]
  }

  return {
    year,
    total: byScope[1] + byScope[2] + byScope[3],
    byScope,
    months,
    awaitingVerification,
    lastMonthWithData,
    previousYearSamePeriod: { total: previousTotal, hasData: previousHasData },
  }
}
