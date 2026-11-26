import { queryOptions, type QueryClient } from '@tanstack/react-query'
import type { SedgAnswers, SedgAutoFigure, SedgLevel, SedgValue } from '@hub/shared/sedg'
import { api } from '@/lib/api'
import { reportHistoryQueryOptions, type Person } from '../reports/queries'

/*
  The SEDG report of one year (GET/PATCH /api/v1/reports/sedg/{year}) and its
  edit history. Saving is done by the page's autosave (use-autosave.ts), which
  updates this cache itself, so the form never jumps while someone types.
*/

export type SedgFigure = { value: SedgValue; note: string }

export type SedgReport = {
  year: number
  level: SedgLevel
  answers: SedgAnswers
  automatic: Partial<Record<SedgAutoFigure, SedgFigure>>
  baselineYear: number | null
  years: number[]
  updatedAt: string | null
  updatedBy: Person
}

export type SedgSaved = { updatedAt: string; updatedBy: Person; level: SedgLevel }

export type SedgChanges = { level?: SedgLevel; answers?: Record<string, SedgValue | null> }

const reportKey = (companyId: string, year: number) => ['company', companyId, 'sedg', year] as const

export const sedgReportQueryOptions = (companyId: string, year: number) =>
  queryOptions({
    queryKey: reportKey(companyId, year),
    queryFn: () => api<SedgReport>(`/reports/sedg/${year}`),
    // The page holds what people type; don't refetch underneath it while they work
    refetchOnWindowFocus: false,
  })

export const sedgHistoryQueryOptions = (companyId: string, year: number) =>
  reportHistoryQueryOptions(reportKey(companyId, year), `/reports/sedg/${year}`)

export const saveSedgChanges = (year: number, changes: SedgChanges, { keepalive = false } = {}) =>
  keepalive
    ? // Leaving the page: the browser finishes this request even after the page is gone
      fetch(`/api/v1/reports/sedg/${year}`, {
        method: 'PATCH',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      }).then(() => undefined)
    : api<SedgSaved>(`/reports/sedg/${year}`, { method: 'PATCH', json: changes })

/**
 * Changes into the cached report, without a refetch: after a save (with its
 * "last edited"), or for the last save sent while leaving the page (so coming
 * straight back shows them even if that request is still on its way).
 */
export function applyChanges(
  queryClient: QueryClient,
  companyId: string,
  year: number,
  changes: SedgChanges,
  saved?: SedgSaved,
) {
  queryClient.setQueryData<SedgReport>(reportKey(companyId, year), (report) => {
    if (!report) return report
    const answers = { ...report.answers }
    for (const [key, value] of Object.entries(changes.answers ?? {})) {
      if (value === null) delete answers[key]
      else answers[key] = value
    }
    const level = saved?.level ?? changes.level ?? report.level
    return saved
      ? { ...report, answers, level, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy }
      : { ...report, answers, level }
  })
  void queryClient.invalidateQueries({ queryKey: [...reportKey(companyId, year), 'history'] })
}

/** Figures that depend on entered values (the intensity uses E1.1, E1.2 and the revenue) */
export const refreshFigures = (queryClient: QueryClient, companyId: string, year: number) =>
  queryClient.invalidateQueries({ queryKey: reportKey(companyId, year), exact: true })
