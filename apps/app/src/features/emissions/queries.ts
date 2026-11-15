import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { createEntry, fetchEntries, fetchSources } from './demo-api'
import type { NewEmissionEntry } from './types'

/*
  TanStack Query definitions for emissions data. Pages use these, never the
  data layer directly, so swapping the demo layer for the real API only touches
  demo-api.ts.
*/

export const emissionKeys = {
  all: ['emissions'] as const,
  entries: () => [...emissionKeys.all, 'entries'] as const,
  sources: () => [...emissionKeys.all, 'sources'] as const,
}

export const entriesQuery = queryOptions({
  queryKey: emissionKeys.entries(),
  queryFn: fetchEntries,
})

export const sourcesQuery = queryOptions({
  queryKey: emissionKeys.sources(),
  queryFn: fetchSources,
  // Emission factors rarely change
  staleTime: 60 * 60 * 1000,
})

export function useCreateEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: NewEmissionEntry) => createEntry(input),
    // Refresh everything that shows entries (dashboard, recent list)
    onSuccess: () => queryClient.invalidateQueries({ queryKey: emissionKeys.entries() }),
  })
}
