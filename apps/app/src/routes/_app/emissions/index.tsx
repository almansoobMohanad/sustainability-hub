import { createFileRoute } from '@tanstack/react-router'
import { ENTRY_STATUSES, type EntryStatus } from '@hub/shared/emissions'
import { EntriesPage } from '@/features/emissions/entries-page'
import type { Scope } from '@/features/emissions/types'

/*
  "/emissions" -> the entries list. Its filters live in the URL
  (?year=2026&status=pending&scope=1, or year=all), so they survive a reload
  and can be linked to (e.g. the dashboard's "Review pending entries").
  Missing year = the current year.
*/
type EntriesSearch = { year?: number | 'all'; status?: EntryStatus; scope?: Scope }

export const Route = createFileRoute('/_app/emissions/')({
  validateSearch: (search: Record<string, unknown>): EntriesSearch => {
    const year = search.year === 'all' ? 'all' : Number(search.year)
    const scope = Number(search.scope)
    return {
      year: year === 'all' || (Number.isInteger(year) && year >= 1990 && year <= 2100) ? year : undefined,
      status: (ENTRY_STATUSES as readonly unknown[]).includes(search.status) ? (search.status as EntryStatus) : undefined,
      scope: scope === 1 || scope === 2 || scope === 3 ? scope : undefined,
    }
  },
  head: () => ({ meta: [{ title: 'Entries · Sustainability Hub' }] }),
  component: EntriesPage,
})
