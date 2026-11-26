import { infiniteQueryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

/* What the reports (SEDG, ESG Ready) share: who edited them, and their history */

export type Person = { id: string; name: string } | null

export type ReportEdit = { id: string; actor: Person; startedAt: string; endedAt: string; changed: string[] }

/**
 * A report's edit history, 20 per page. `queryKey` is the report's own key
 * (['company', id, 'sedg', year]) so leaving the company forgets it too.
 */
export const reportHistoryQueryOptions = (reportKey: readonly unknown[], path: string) =>
  infiniteQueryOptions({
    queryKey: [...reportKey, 'history'],
    queryFn: ({ pageParam, signal }) =>
      api<{ items: ReportEdit[]; nextCursor: string | null }>(
        `${path}/history${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
        { signal },
      ),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
