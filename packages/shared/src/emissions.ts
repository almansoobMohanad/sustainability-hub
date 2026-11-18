import { can, type Role } from './permissions'

/*
  Emission entries: statuses, limits and who may do what with an entry. Used by
  the API (which enforces it) and the app (which only shows the buttons that
  will work), so both always agree.
*/

export const ENTRY_STATUSES = ['pending', 'verified', 'rejected'] as const
export type EntryStatus = (typeof ENTRY_STATUSES)[number]

export const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
  pending: 'Pending',
  verified: 'Verified',
  rejected: 'Rejected',
}

export const ENTRY_LIMITS = {
  /** Largest activity amount accepted (anything bigger is surely a typo) */
  maxAmount: 1e12,
  dataSourceLength: 200,
  notesLength: 1000,
  rejectionReasonLength: 500,
  /** Entries verified in one bulk request */
  bulkVerify: 100,
  /** Earliest reporting year accepted */
  firstYear: 1990,
} as const

/** "YYYY-MM": one calendar month, the reporting period of an entry */
export const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

/**
 * The latest month that may be reported: the current month. "Current" uses the
 * clock 14 hours ahead (the furthest time zone), so someone in Malaysia on the
 * morning of 1 January can already report January before the server's UTC
 * clock reaches it.
 */
export function latestReportablePeriod(now = new Date()) {
  const ahead = new Date(now.getTime() + 14 * 60 * 60 * 1000)
  return `${ahead.getUTCFullYear()}-${String(ahead.getUTCMonth() + 1).padStart(2, '0')}`
}

/** "2026-03" -> { year: 2026, month: 3, start: "2026-03-01", end: "2026-03-31" } */
export function periodBounds(period: string) {
  const match = PERIOD_PATTERN.exec(period)
  if (!match) throw new Error(`Invalid period "${period}"`)
  const year = Number(match[1])
  const month = Number(match[2])
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, '0')
  return { year, month, start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` }
}

export type EntryActions = {
  edit: boolean
  delete: boolean
  verify: boolean
  reject: boolean
  /** Send a verified entry back to Pending so it can be corrected */
  reopen: boolean
}

/**
 * What a person may do with one entry:
 * - edit / delete: while it's not verified, its creator or a verifier (Manager, Admin)
 * - verify / reject: Pending entries, verifiers only; their own entries too
 *   (they still go through Pending first: submitting is never automatic approval)
 * - reopen: verified entries, verifiers only
 */
export function entryActions(
  role: Role | null | undefined,
  userId: string,
  entry: { status: EntryStatus; createdById: string | null },
): EntryActions {
  const verifier = can(role, 'emissions', 'verify')
  const own = entry.createdById !== null && entry.createdById === userId
  const editable = entry.status !== 'verified' && (own || verifier) && can(role, 'emissions', 'create')
  return {
    edit: editable,
    delete: editable,
    verify: verifier && entry.status === 'pending',
    reject: verifier && entry.status === 'pending',
    reopen: verifier && entry.status === 'verified',
  }
}
