import { queryOptions, type QueryClient } from '@tanstack/react-query'
import type { EsgAnswers, EsgAutoValue, EsgValue } from '@hub/shared/esg-ready'
import { api } from '@/lib/api'
import { reportHistoryQueryOptions, type Person } from '../reports/queries'
import type { ReportChanges } from '../reports/use-autosave'

/*
  The ESG Ready self-assessment of one year (GET/PATCH
  /api/v1/reports/esg-ready/{year}) and its history. The page's autosave
  updates this cache itself, so answers never jump while someone works.
*/

export type EsgReadyReport = {
  year: number
  answers: EsgAnswers
  automatic: Record<EsgAutoValue, { value: string; note: string }>
  years: number[]
  updatedAt: string | null
  updatedBy: Person
}

export type EsgReadySaved = { updatedAt: string; updatedBy: Person }

const reportKey = (companyId: string, year: number) => ['company', companyId, 'esg-ready', year] as const
const path = (year: number) => `/reports/esg-ready/${year}`

export const esgReadyQueryOptions = (companyId: string, year: number) =>
  queryOptions({
    queryKey: reportKey(companyId, year),
    queryFn: () => api<EsgReadyReport>(path(year)),
    // The page holds what people choose; don't refetch underneath it while they work
    refetchOnWindowFocus: false,
  })

export const esgReadyHistoryQueryOptions = (companyId: string, year: number) =>
  reportHistoryQueryOptions(reportKey(companyId, year), path(year))

export const saveEsgReadyChanges = (
  year: number,
  changes: ReportChanges<EsgValue>,
  { keepalive = false } = {},
): Promise<EsgReadySaved | undefined> =>
  keepalive
    ? // Leaving the page: the browser finishes this request even after the page is gone
      fetch(`/api/v1${path(year)}`, {
        method: 'PATCH',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: changes.answers }),
      }).then(() => undefined)
    : api<EsgReadySaved>(path(year), { method: 'PATCH', json: { answers: changes.answers } })

/** Saved (or sent while leaving) answers into the cached report, without a refetch */
export function applyEsgReadyChanges(
  queryClient: QueryClient,
  companyId: string,
  year: number,
  changes: ReportChanges<EsgValue>,
  saved?: EsgReadySaved,
) {
  queryClient.setQueryData<EsgReadyReport>(reportKey(companyId, year), (report) => {
    if (!report) return report
    const answers = { ...report.answers }
    for (const [key, value] of Object.entries(changes.answers ?? {})) {
      if (value === null) delete answers[key]
      else answers[key] = value
    }
    return saved ? { ...report, answers, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy } : { ...report, answers }
  })
  void queryClient.invalidateQueries({ queryKey: [...reportKey(companyId, year), 'history'] })
}
