import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { Sector } from '@hub/shared/sectors'
import { api } from '@/lib/api'

/*
  Emission factor library and the sources a company tracks (GET/POST/DELETE
  /api/v1/...). Pages use these query options and hooks, never fetch directly.
*/

export type Scope = 1 | 2 | 3

export type FactorValue = { unit: string; kgCo2ePerUnit: number; year: number }

export type EmissionSource = {
  id: string
  scope: Scope
  category: string
  name: string
}

export type SourceWithFactors = EmissionSource & { factors: FactorValue[] }
export type CompanySource = SourceWithFactors & { defaultUnit: string | null }
export type TemplateSource = EmissionSource & { defaultUnit: string }

export type FactorLibrary = {
  title: string
  publisher: string
  licence: string
  licenceUrl: string
  years: { year: number; version: string; sourceUrl: string }[]
}

// The library is the same for everyone and only changes when the server is updated
const LIBRARY_STALE_TIME = 60 * 60 * 1000

export const factorLibraryQueryOptions = queryOptions({
  queryKey: ['factor-library'],
  queryFn: () => api<FactorLibrary>('/factor-library'),
  staleTime: LIBRARY_STALE_TIME,
})

/** One sector's suggested sources, fetched only when that sector is chosen */
export const sectorTemplateQueryOptions = (sector: Sector) =>
  queryOptions({
    queryKey: ['sector-templates', sector],
    queryFn: () => api<{ sector: Sector; sources: TemplateSource[] }>(`/sector-templates/${sector}`),
    staleTime: LIBRARY_STALE_TIME,
    select: (data) => data.sources,
  })

/*
  Library search. The library has thousands of sources, so it's never loaded
  whole: the server filters and returns one page (30) at a time, and the next
  page is fetched only when the list is scrolled to its end (useInfiniteQuery).
*/
export type LibrarySearch = { q: string; scope: Scope | null; category: string | null; year: number }

type SourcePage = { year: number; items: SourceWithFactors[]; nextCursor: string | null; total: number | null }

export const librarySearchQueryOptions = ({ q, scope, category, year }: LibrarySearch) =>
  infiniteQueryOptions({
    queryKey: ['emission-sources', { q, scope, category, year }],
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ year: String(year), limit: '30' })
      if (q) params.set('q', q)
      if (scope) params.set('scope', String(scope))
      if (category) params.set('category', category)
      if (pageParam) params.set('cursor', pageParam)
      return api<SourcePage>(`/emission-sources?${params}`, { signal })
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: LIBRARY_STALE_TIME,
    // Keep showing the previous results while the next search loads (no flicker while typing)
    placeholderData: keepPreviousData,
  })

/** Categories (with counts) for the filter menu, optionally for one scope */
export const sourceCategoriesQueryOptions = (scope: Scope | null) =>
  queryOptions({
    queryKey: ['emission-source-categories', scope],
    queryFn: () =>
      api<{ categories: { scope: Scope; category: string; count: number }[] }>(
        `/emission-sources/categories${scope ? `?scope=${scope}` : ''}`,
      ),
    staleTime: LIBRARY_STALE_TIME,
    select: (data) => data.categories,
  })

/* Company data: keys start with ['company', id] like the rest of the company pages */

export type CompanySettings = {
  sector: Sector | null
  /** New entries start Pending and need a Manager/Admin to verify them (false: verified automatically) */
  requireVerification: boolean
  /** The year reductions are measured against (SEDG); null until an Admin chooses one */
  baselineYear: number | null
}

export const companySettingsQueryOptions = (companyId: string) =>
  queryOptions({
    queryKey: ['company', companyId, 'settings'],
    queryFn: () => api<CompanySettings>('/company/settings'),
  })

export const companySourcesQueryOptions = (companyId: string, year: number) =>
  queryOptions({
    queryKey: ['company', companyId, 'sources', year],
    queryFn: () => api<{ year: number; sources: CompanySource[] }>(`/company/sources?year=${year}`),
    placeholderData: keepPreviousData, // changing the year keeps the list on screen while loading
  })

export function useUpdateCompanySettings(companyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes: Partial<CompanySettings>) =>
      api<CompanySettings>('/company/settings', { method: 'PATCH', json: changes }),
    onSuccess: (settings) => queryClient.setQueryData(['company', companyId, 'settings'], settings),
  })
}

export function useAddCompanySources(companyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sources: { sourceId: string; defaultUnit?: string | null }[]) =>
      api<{ added: number }>('/company/sources', { method: 'POST', json: { sources } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['company', companyId, 'sources'] }),
  })
}

export function useRemoveCompanySource(companyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sourceId: string) => api<void>(`/company/sources/${sourceId}`, { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['company', companyId, 'sources'] }),
  })
}
