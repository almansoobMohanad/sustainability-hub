import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  EmissionEntry,
  EmissionEntryDetail,
  EntryChanges,
  EntryFilters,
  NewEmissionEntry,
  StatusCounts,
  YearSummary,
} from './types'

/*
  Emission entries of the active company (/api/v1/emissions/...). Pages use
  these, never fetch directly.

  Keys start with ['company', companyId, 'emissions'], so switching company
  (which forgets company data) and every change below refresh the right things:
  after any change, all entry lists, the dashboard summary and that entry's
  detail are refetched.
*/

const base = (companyId: string) => ['company', companyId, 'emissions'] as const

export const emissionKeys = {
  all: base,
  lists: (companyId: string) => [...base(companyId), 'list'] as const,
  summary: (companyId: string, year: number) => [...base(companyId), 'summary', year] as const,
  detail: (companyId: string, id: string) => [...base(companyId), 'detail', id] as const,
  counts: (companyId: string, filters: CountFilters) => [...base(companyId), 'counts', filters] as const,
}

type EntryPage = { items: EmissionEntry[]; nextCursor: string | null; total: number | null }

/** Entries one page (30) at a time, newest reporting month first; filtered by the server */
export const entriesQueryOptions = (companyId: string, filters: EntryFilters, limit = 30) =>
  infiniteQueryOptions({
    queryKey: [...emissionKeys.lists(companyId), filters, limit],
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (filters.year) params.set('year', String(filters.year))
      if (filters.status) params.set('status', filters.status)
      if (filters.scope) params.set('scope', String(filters.scope))
      if (filters.mine) params.set('mine', 'true')
      if (pageParam) params.set('cursor', pageParam)
      return api<EntryPage>(`/emissions/entries?${params}`, { signal })
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    placeholderData: keepPreviousData,
  })

export const summaryQueryOptions = (companyId: string, year: number) =>
  queryOptions({
    queryKey: emissionKeys.summary(companyId, year),
    queryFn: () => api<YearSummary>(`/emissions/summary?year=${year}`),
    placeholderData: keepPreviousData, // changing the year keeps the page on screen while loading
  })

type CountFilters = { year: number | null; scope: number | null }

/**
 * Entries per status, counted by the server. No year = all years: the sidebar's
 * "waiting for verification" badge uses that. Refreshed with every change to entries.
 */
export const statusCountsQueryOptions = (companyId: string, filters: CountFilters) =>
  queryOptions({
    queryKey: emissionKeys.counts(companyId, filters),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams()
      if (filters.year) params.set('year', String(filters.year))
      if (filters.scope) params.set('scope', String(filters.scope))
      return api<StatusCounts>(`/emissions/status-counts?${params}`, { signal })
    },
    placeholderData: keepPreviousData, // changing a filter keeps the old numbers until the new ones arrive
  })

export const entryDetailQueryOptions = (companyId: string, id: string) =>
  queryOptions({
    queryKey: emissionKeys.detail(companyId, id),
    queryFn: () => api<EmissionEntryDetail>(`/emissions/entries/${id}`),
  })

/** Every change to entries: refetch lists, summaries and details of this company */
function useRefreshEntries(companyId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: emissionKeys.all(companyId) })
}

export function useCreateEntry(companyId: string) {
  const refresh = useRefreshEntries(companyId)
  return useMutation({
    mutationFn: (input: NewEmissionEntry) => api<EmissionEntry>('/emissions/entries', { method: 'POST', json: input }),
    onSuccess: refresh,
  })
}

export function useUpdateEntry(companyId: string) {
  const refresh = useRefreshEntries(companyId)
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: EntryChanges }) =>
      api<EmissionEntry>(`/emissions/entries/${id}`, { method: 'PATCH', json: changes }),
    onSettled: refresh,
  })
}

export function useDeleteEntry(companyId: string) {
  const refresh = useRefreshEntries(companyId)
  return useMutation({
    mutationFn: (id: string) => api<void>(`/emissions/entries/${id}`, { method: 'DELETE' }),
    onSettled: refresh,
  })
}

export type ReviewAction = { id: string; action: 'verify' | 'reopen' } | { id: string; action: 'reject'; reason: string }

export function useReviewEntry(companyId: string) {
  const refresh = useRefreshEntries(companyId)
  return useMutation({
    mutationFn: (review: ReviewAction) =>
      api<EmissionEntry>(`/emissions/entries/${review.id}/${review.action}`, {
        method: 'POST',
        json: review.action === 'reject' ? { reason: review.reason } : undefined,
      }),
    onSettled: refresh,
  })
}

export function useBulkVerify(companyId: string) {
  const refresh = useRefreshEntries(companyId)
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<{ verified: number; skipped: number }>('/emissions/entries/verify', { method: 'POST', json: { ids } }),
    onSettled: refresh,
  })
}
