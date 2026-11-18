import type { EntryStatus } from '@hub/shared/emissions'

/** GHG Protocol scopes. */
export type Scope = 1 | 2 | 3

export const SCOPES: Scope[] = [1, 2, 3]

export const SCOPE_INFO: Record<Scope, { label: string; description: string }> = {
  1: { label: 'Scope 1', description: 'Direct emissions from sources you own or control' },
  2: { label: 'Scope 2', description: 'Indirect emissions from purchased energy' },
  3: { label: 'Scope 3', description: 'Other indirect emissions in your value chain' },
}

type Person = { id: string; name: string }

/** One entry as the API returns it (GET /api/v1/emissions/entries) */
export type EmissionEntry = {
  id: string
  /** Reporting month, "YYYY-MM" */
  period: string
  reportingYear: number
  scope: Scope
  source: { id: string; name: string; category: string }
  amount: number
  unit: string
  /** The factor used, kept with the entry (later factor changes don't rewrite history) */
  kgCo2ePerUnit: number
  /** The factor set it came from (an earlier year when the entry's year isn't published yet) */
  factorYear: number
  /** amount x factor, calculated by the server */
  co2eKg: number
  dataSource: string | null
  status: EntryStatus
  rejectionReason: string | null
  createdBy: Person | null
  createdAt: string
  reviewedBy: Person | null
  reviewedAt: string | null
}

export type EntryEvent = {
  action: 'created' | 'updated' | 'verified' | 'rejected' | 'reopened' | 'deleted'
  actor: Person | null
  details: Record<string, unknown>
  createdAt: string
}

export type EmissionEntryDetail = EmissionEntry & { notes: string | null; events: EntryEvent[] }

export type NewEmissionEntry = {
  sourceId: string
  unit: string
  amount: number
  period: string
  dataSource?: string | null
  notes?: string | null
}

export type EntryChanges = Partial<Pick<NewEmissionEntry, 'unit' | 'amount' | 'period' | 'dataSource' | 'notes'>>

export type EntryFilters = { year: number | null; status: EntryStatus | null; scope: Scope | null; mine?: boolean }

export type ScopeTotals = Record<Scope, number>

export type MonthSummary = {
  /** 0-based month */
  month: number
  byScope: ScopeTotals
  total: number
  entries: number
  hasData: boolean
}

/** GET /api/v1/emissions/summary: kg CO2e, calculated in the database */
export type YearSummary = {
  year: number
  /** Years that have entries, newest first */
  years: number[]
  totalKg: number
  byScope: ScopeTotals
  pendingKg: number
  pendingEntries: number
  /** Last month (0-based) with entries, or -1 */
  lastMonthWithData: number
  months: MonthSummary[]
  /** The same months of the previous year; `complete` when it has data for each of them */
  previousYearSamePeriod: { totalKg: number; complete: boolean }
}
