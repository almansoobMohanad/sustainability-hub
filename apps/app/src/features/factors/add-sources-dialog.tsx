import { useEffect, useId, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Check, Plus, Search } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@hub/ui/components/dialog'
import { Input } from '@hub/ui/components/input'
import { Label } from '@hub/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hub/ui/components/select'
import { Skeleton } from '@hub/ui/components/skeleton'
import { SECTOR_INFO, type Sector } from '@hub/shared/sectors'
import { errorMessage } from '@/lib/api'
import { formatNumber } from '@/lib/format'
import {
  librarySearchQueryOptions,
  sectorTemplateQueryOptions,
  sourceCategoriesQueryOptions,
  useAddCompanySources,
  type Scope,
} from './queries'
import { SourceRow } from './source-list'

/*
  "Add sources": the sources suggested for the company's sector that it
  doesn't track yet, then the library: search by words, filter by scope and
  category. All filtering happens on the server; results arrive 30 at a time
  and the next 30 load when the list is scrolled to its end (or with the
  "Load more" button, for keyboards and screen readers).
*/

type Props = {
  companyId: string
  year: number
  sector: Sector | null
  trackedIds: Set<string>
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** The value, but only after it stopped changing for `delay` ms (search while typing) */
function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

const ALL = 'all'

export function AddSourcesDialog({ companyId, year, sector, trackedIds, open, onOpenChange }: Props) {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const q = useDebounced(query.trim())
  // Shown as "Added" immediately, before the list behind the dialog has reloaded
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const add = useAddCompanySources(companyId)

  const template = useQuery({ ...sectorTemplateQueryOptions(sector ?? 'other'), enabled: open && sector !== null })
  const categories = useQuery({ ...sourceCategoriesQueryOptions(scope), enabled: open })
  const results = useInfiniteQuery({ ...librarySearchQueryOptions({ q, scope, category, year }), enabled: open })
  const items = results.data?.pages.flatMap((page) => page.items) ?? []
  const total = results.data?.pages[0]?.total ?? null

  // Lazy loading: when the end of the list scrolls into view, fetch the next page
  const scrollArea = useRef<HTMLDivElement>(null)
  const listEnd = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = results
  // New search or filter: back to the top. Otherwise the list would still be
  // scrolled to the end and immediately pull in pages nobody asked for.
  useEffect(() => {
    scrollArea.current?.scrollTo({ top: 0 })
  }, [q, scope, category])
  useEffect(() => {
    const target = listEnd.current
    if (!target || !hasNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
      },
      { root: scrollArea.current, rootMargin: '200px' }, // start a little before the very end
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length])

  const isTracked = (id: string) => trackedIds.has(id) || justAdded.has(id)
  const filtering = Boolean(q || scope || category)
  const suggestions = sector && !filtering ? (template.data ?? []).filter((source) => !isTracked(source.id)) : []

  async function addSources(sources: { sourceId: string; defaultUnit?: string | null }[]) {
    setError(null)
    try {
      await add.mutateAsync(sources)
      setJustAdded((previous) => new Set([...previous, ...sources.map((source) => source.sourceId)]))
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  function addButton(sourceId: string, name: string, defaultUnit?: string) {
    if (isTracked(sourceId)) {
      return (
        <span className="inline-flex h-8 shrink-0 items-center gap-1 px-2 text-sm text-emerald-700 dark:text-emerald-400">
          <Check className="size-4" aria-hidden />
          Added
        </span>
      )
    }
    return (
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 rounded-full"
        disabled={add.isPending}
        onClick={() => addSources([{ sourceId, defaultUnit }])}
        aria-label={`Add ${name}`}
      >
        <Plus aria-hidden />
        Add
      </Button>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setQuery('')
          setScope(null)
          setCategory(null)
          setJustAdded(new Set())
          setError(null)
        }
      }}
    >
      <DialogContent className="flex max-h-[85svh] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add emission sources</DialogTitle>
          <DialogDescription>
            Factors shown for {year}. Each source can be measured in any of its units when entering data.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Label htmlFor={searchId} className="sr-only">
              Search the library
            </Label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search, e.g. diesel, refrigerant, flights"
              className="pl-9"
              autoComplete="off"
            />
          </div>
          <Select
            value={scope ? String(scope) : ALL}
            onValueChange={(value) => {
              setScope(value === ALL ? null : (Number(value) as Scope))
              setCategory(null) // categories differ per scope
            }}
          >
            <SelectTrigger className="w-full sm:w-32" aria-label="Scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All scopes</SelectItem>
              <SelectItem value="1">Scope 1</SelectItem>
              <SelectItem value="2">Scope 2</SelectItem>
              <SelectItem value="3">Scope 3</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category ?? ALL} onValueChange={(value) => setCategory(value === ALL ? null : value)}>
            <SelectTrigger className="w-full sm:w-48" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {(categories.data ?? []).map((option) => (
                <SelectItem key={`${option.scope}-${option.category}`} value={option.category}>
                  {option.category} ({option.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div ref={scrollArea} className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
          {suggestions.length > 0 ? (
            <section aria-labelledby="suggested-heading" className="mb-6">
              <div className="flex items-center justify-between gap-3">
                <h3 id="suggested-heading" className="text-sm font-semibold">
                  Suggested for {SECTOR_INFO[sector!].label.toLowerCase()}
                </h3>
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={add.isPending}
                  onClick={() =>
                    addSources(suggestions.map((source) => ({ sourceId: source.id, defaultUnit: source.defaultUnit })))
                  }
                >
                  Add all {suggestions.length}
                </Button>
              </div>
              <ul className="divide-y">
                {suggestions.map((source) => (
                  <SourceRow key={source.id} source={source} action={addButton(source.id, source.name, source.defaultUnit)} />
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="library-heading">
            <h3 id="library-heading" className="text-sm font-semibold">
              {filtering ? 'Results' : 'All sources'}{' '}
              <span className="font-normal text-muted-foreground" aria-live="polite">
                {total !== null ? `(${formatNumber(total)})` : null}
              </span>
            </h3>
            {results.isPending ? (
              <div className="mt-3 space-y-3" aria-hidden>
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : results.isError && items.length === 0 ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {errorMessage(results.error)}
              </p>
            ) : items.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No sources match. Try fewer or different words.</p>
            ) : (
              <>
                <ul className="divide-y">
                  {items.map((source) => (
                    <SourceRow key={source.id} source={source} year={year} action={addButton(source.id, source.name)} />
                  ))}
                </ul>
                <div ref={listEnd} className="flex items-center justify-between gap-3 py-3 text-sm text-muted-foreground">
                  <span>
                    Showing {formatNumber(items.length)}
                    {total !== null ? ` of ${formatNumber(total)}` : null}
                  </span>
                  {hasNextPage ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      disabled={isFetchingNextPage}
                      onClick={() => void fetchNextPage()}
                    >
                      {isFetchingNextPage ? 'Loading...' : 'Load more'}
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
