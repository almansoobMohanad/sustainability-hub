import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Check, CirclePlus, Clock, MoreHorizontal, X } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import { Checkbox } from '@hub/ui/components/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@hub/ui/components/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hub/ui/components/select'
import { Skeleton } from '@hub/ui/components/skeleton'
import { toast } from '@hub/ui/components/sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hub/ui/components/table'
import { cn } from '@hub/ui/lib/utils'
import { ENTRY_LIMITS, ENTRY_STATUSES, ENTRY_STATUS_LABELS, entryActions, type EntryStatus } from '@hub/shared/emissions'
import { can } from '@hub/shared/permissions'
import { PageHeader } from '@/components/page-header'
import { PageBody, PageTitle } from '@/components/page-layout'
import { useMe } from '@/features/company/me'
import { unitLabel } from '@/features/factors/format'
import { useLoadMore } from '@/hooks/use-load-more'
import { errorMessage } from '@/lib/api'
import { formatNumber, formatPeriod, formatTonnes } from '@/lib/format'
import { DeleteEntryDialog, EditEntryDialog, EntryDetailDialog, RejectDialog } from './entry-dialogs'
import {
  entriesQueryOptions,
  statusCountsQueryOptions,
  summaryQueryOptions,
  useBulkVerify,
  useDeleteEntry,
  useReviewEntry,
  type ReviewAction,
} from './queries'
import { StatusBadge } from './status-badge'
import { STATUS_STYLE } from './status-style'
import { SCOPES, SCOPE_INFO, type EmissionEntry, type Scope } from './types'

/*
  Entries: the company's emissions data, newest reporting month first.
  Filters (year, status, scope) live in the URL, so a link like "Pending
  entries of 2026" works, and they're applied by the server. 30 entries load at
  a time; more load when the end of the table scrolls into view.

  Managers and Admins verify, reject (with a reason) and reopen entries, also
  several Pending ones at once. Everyone can open an entry to see its notes
  and history, and edit or delete their own entries until they're verified.

  Making "something needs verifying" obvious (user feedback 2026-11-19): status
  tabs with counts (Pending in amber), an amber banner for Managers/Admins when
  entries are waiting (all years), a Verify button on each Pending row, and the
  same count next to "Entries" in the sidebar.
*/

type Dialog = { kind: 'detail' | 'reject' | 'edit' | 'delete'; entry: EmissionEntry } | null
const ALL = 'all'

export function EntriesPage() {
  const me = useMe()
  const company = me.company!
  const search = useSearch({ from: '/_app/emissions/' })
  const navigate = useNavigate({ from: '/emissions/' })
  const thisYear = new Date().getFullYear()
  const year = search.year === 'all' ? null : (search.year ?? thisYear)
  const filters = { year, status: search.status ?? null, scope: search.scope ?? null }
  const filtersKey = JSON.stringify(filters)

  const entries = useInfiniteQuery(entriesQueryOptions(company.id, filters))
  const items = entries.data?.pages.flatMap((page) => page.items) ?? []
  const total = entries.data?.pages[0]?.total ?? null
  // Years that have data, for the year menu (shared with the dashboard's cached summary)
  const summary = useQuery(summaryQueryOptions(company.id, thisYear))
  const years = [...new Set([thisYear, ...(summary.data?.years ?? []), ...(year ? [year] : [])])].sort((a, b) => b - a)

  const verifier = can(me.role, 'emissions', 'verify')
  // Counts for the status tabs (this year/scope) and, for verifiers, everything waiting (all years)
  const counts = useQuery(statusCountsQueryOptions(company.id, { year, scope: filters.scope })).data
  const waiting = useQuery({ ...statusCountsQueryOptions(company.id, { year: null, scope: null }), enabled: verifier }).data
    ?.pending
  const actionsFor = (entry: EmissionEntry) =>
    entryActions(me.role, me.user.id, { status: entry.status, createdById: entry.createdBy?.id ?? null })

  // Selection for bulk verify; it belongs to the current filters and is forgotten when they change
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({ key: filtersKey, ids: new Set() })
  const selected = selection.key === filtersKey ? selection.ids : new Set<string>()
  const pendingOnScreen = items.filter((entry) => entry.status === 'pending')
  const setSelected = (ids: Set<string>) => setSelection({ key: filtersKey, ids })

  const [dialog, setDialog] = useState<Dialog>(null)
  const review = useReviewEntry(company.id)
  const remove = useDeleteEntry(company.id)
  const bulk = useBulkVerify(company.id)

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = entries
  const listEnd = useLoadMore({
    hasMore: Boolean(hasNextPage),
    loading: isFetchingNextPage,
    loadMore: () => void fetchNextPage(),
  })

  function setFilter(changes: Partial<typeof search>) {
    void navigate({ search: (previous) => ({ ...previous, ...changes }), replace: true })
  }

  async function runReview(action: ReviewAction) {
    const done = { verify: 'Entry verified', reject: 'Entry rejected', reopen: 'Entry reopened: it is Pending again' }
    await review.mutateAsync(action)
    toast.success(done[action.action])
  }

  async function quickReview(action: ReviewAction) {
    try {
      await runReview(action)
      setDialog(null)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function verifySelected() {
    try {
      const result = await bulk.mutateAsync([...selected])
      setSelected(new Set())
      toast.success(
        `${result.verified} ${result.verified === 1 ? 'entry' : 'entries'} verified${result.skipped ? ` (${result.skipped} skipped: no longer Pending)` : ''}`,
      )
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  function openAction(entry: EmissionEntry, action: 'verify' | 'reject' | 'reopen' | 'edit' | 'delete') {
    if (action === 'verify' || action === 'reopen') void quickReview({ id: entry.id, action })
    else setDialog({ kind: action, entry })
  }

  const filtered = filters.status !== null || filters.scope !== null || search.year !== undefined

  /** Selecting Pending entries for bulk verify (at most 100 at a time) */
  function toggleSelected(entryId: string, checked: boolean) {
    const next = new Set(selected)
    if (checked && next.size < ENTRY_LIMITS.bulkVerify) next.add(entryId)
    else next.delete(entryId)
    setSelected(next)
  }

  const selectAllBox = (
    <Checkbox
      aria-label="Select all Pending entries shown"
      disabled={pendingOnScreen.length === 0}
      checked={
        pendingOnScreen.length > 0 && pendingOnScreen.every((entry) => selected.has(entry.id))
          ? true
          : selected.size > 0
            ? 'indeterminate'
            : false
      }
      onCheckedChange={(checked) =>
        setSelected(
          checked === true
            ? new Set(pendingOnScreen.slice(0, ENTRY_LIMITS.bulkVerify).map((entry) => entry.id))
            : new Set(),
        )
      }
    />
  )

  const selectBox = (entry: EmissionEntry) =>
    entry.status === 'pending' ? (
      <Checkbox
        aria-label={`Select ${entry.source.name}, ${formatPeriod(entry.period)}`}
        checked={selected.has(entry.id)}
        onCheckedChange={(checked) => toggleSelected(entry.id, checked === true)}
      />
    ) : null

  /** The source name opens the details (notes, history, actions) */
  const detailButton = (entry: EmissionEntry, className: string) => (
    <button
      type="button"
      className={`text-left font-medium underline-offset-4 hover:underline ${className}`}
      onClick={() => setDialog({ kind: 'detail', entry })}
    >
      {entry.source.name}
    </button>
  )

  /** Pending rows: verify in one click (the menu has Reject and the rest) */
  const verifyButton = (entry: EmissionEntry) =>
    actionsFor(entry).verify ? (
      <Button
        size="sm"
        variant="outline"
        className="h-7 rounded-full px-2.5"
        disabled={review.isPending && review.variables?.id === entry.id}
        aria-label={`Verify ${entry.source.name}, ${formatPeriod(entry.period)}`}
        onClick={() => openAction(entry, 'verify')}
      >
        <Check className="text-emerald-600" strokeWidth={2.5} aria-hidden />
        Verify
      </Button>
    ) : null

  const actionsMenu = (entry: EmissionEntry) => {
    const actions = actionsFor(entry)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={`Actions for ${entry.source.name}, ${formatPeriod(entry.period)}`}
          >
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog({ kind: 'detail', entry })}>View details</DropdownMenuItem>
          {actions.verify ? <DropdownMenuItem onSelect={() => openAction(entry, 'verify')}>Verify</DropdownMenuItem> : null}
          {actions.reject ? <DropdownMenuItem onSelect={() => openAction(entry, 'reject')}>Reject...</DropdownMenuItem> : null}
          {actions.reopen ? <DropdownMenuItem onSelect={() => openAction(entry, 'reopen')}>Reopen</DropdownMenuItem> : null}
          {actions.edit ? <DropdownMenuItem onSelect={() => openAction(entry, 'edit')}>Edit...</DropdownMenuItem> : null}
          {actions.delete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => openAction(entry, 'delete')}>
                Delete...
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <>
      <PageHeader title="Entries" />
      <PageBody>
        <PageTitle
          title="Emission entries"
          infoLabel="About entries"
          info={
            <>
              <span>Every activity your company recorded, newest reporting month first.</span>
              <span>
                Entries count in reports once a Manager or Admin verifies them. Open an entry to see its notes and
                history.
              </span>
            </>
          }
          actions={
            <Button asChild className="h-9 rounded-full px-4">
              <Link to="/emissions/new">
                <CirclePlus data-icon="inline-start" aria-hidden />
                Add emissions
              </Link>
            </Button>
          }
        />

        {/* Managers/Admins: entries waiting for verification (any year), unless already looking at them */}
        {verifier && waiting !== undefined && waiting > 0 && !(filters.status === 'pending' && year === null) ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-300/70 ring-inset dark:bg-amber-950/40 dark:ring-amber-800"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/60">
              <Clock className="size-4 text-amber-700 dark:text-amber-300" strokeWidth={2.5} aria-hidden />
            </span>
            <p className="min-w-0 flex-1 text-sm text-amber-950 dark:text-amber-100">
              <span className="font-semibold">
                {waiting === 1 ? '1 entry is' : `${formatNumber(waiting)} entries are`} waiting for verification
              </span>
              <span className="hidden text-amber-900/80 sm:inline dark:text-amber-200/80"> · they don&apos;t count as verified data yet</span>
            </p>
            <Button
              size="sm"
              className="h-8 rounded-full bg-amber-600 px-3.5 text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400"
              onClick={() => setFilter({ status: 'pending', year: 'all' })}
            >
              Review now
            </Button>
          </div>
        ) : null}

        {/* Filters: one row above the table they affect */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusTabs
            value={filters.status}
            counts={counts}
            onChange={(status) => setFilter({ status: status ?? undefined })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={year ? String(year) : ALL} onValueChange={(value) => setFilter({ year: value === ALL ? 'all' : Number(value) })}>
              <SelectTrigger aria-label="Year" className="w-32 rounded-full data-[size=default]:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All years</SelectItem>
                {years.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.scope ? String(filters.scope) : ALL}
              onValueChange={(value) => setFilter({ scope: value === ALL ? undefined : (Number(value) as Scope) })}
            >
              <SelectTrigger aria-label="Scope" className="w-32 rounded-full data-[size=default]:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All scopes</SelectItem>
                {SCOPES.map((scope) => (
                  <SelectItem key={scope} value={String(scope)}>
                    {SCOPE_INFO[scope].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filtered ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-full px-3 text-muted-foreground"
                onClick={() => void navigate({ search: {}, replace: true })}
              >
                <X aria-hidden />
                Reset
              </Button>
            ) : null}
          </div>
        </div>

        {verifier && selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-foreground px-4 py-2 text-sm text-background">
            <span className="font-medium">
              {selected.size} {selected.size === 1 ? 'entry' : 'entries'} selected
            </span>
            <Button
              size="sm"
              className="h-8 rounded-full bg-background px-3.5 text-foreground hover:bg-background/90"
              disabled={bulk.isPending}
              onClick={verifySelected}
            >
              <Check className="text-emerald-600" strokeWidth={2.5} aria-hidden />
              {bulk.isPending ? 'Verifying...' : 'Verify selected'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-full px-3 text-background hover:bg-background/15 hover:text-background"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </Button>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-xl border">
          {entries.isPending ? (
            <div className="space-y-3 p-4" aria-label="Loading entries">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : entries.isError && items.length === 0 ? (
            <p role="alert" className="p-4 text-sm text-destructive">
              {errorMessage(entries.error)}
            </p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <p className="font-medium">{filtered || year ? 'No entries match these filters' : 'No entries yet'}</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {filters.status === 'pending'
                  ? 'Nothing is waiting for verification here.'
                  : year && !filters.status && !filters.scope
                    ? `Nothing recorded for ${year} yet.`
                    : 'Try another year, status or scope.'}
              </p>
              <Button asChild className="rounded-full">
                <Link to="/emissions/new">Add emissions</Link>
              </Button>
            </div>
          ) : (
            <>
              {/* Phones: a stacked list (a table would need sideways scrolling) */}
              <ul className="divide-y md:hidden">
                {verifier && pendingOnScreen.length > 0 ? (
                  <li className="flex items-center gap-3 bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
                    {selectAllBox}
                    Select all Pending
                  </li>
                ) : null}
                {items.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                    {verifier ? <span className="w-4 shrink-0 pt-1">{selectBox(entry)}</span> : null}
                    <div className="min-w-0 flex-1">
                      {detailButton(entry, 'line-clamp-2 [overflow-wrap:anywhere]')}
                      <p className="text-xs text-muted-foreground">
                        {formatPeriod(entry.period)} · {SCOPE_INFO[entry.scope].label} · {formatNumber(entry.amount)} {unitLabel(entry.unit)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={entry.status} />
                        <span className="text-sm font-medium tabular-nums">{formatTonnes(entry.co2eKg, 2)} t</span>
                        <span className="ml-auto">{verifyButton(entry)}</span>
                      </div>
                    </div>
                    {actionsMenu(entry)}
                  </li>
                ))}
              </ul>

              <Table className="hidden md:table">
                <TableHeader className="bg-muted/40 [&_th]:h-10 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground">
                  <TableRow className="hover:bg-transparent">
                    {verifier ? <TableHead className="w-10 pl-4">{selectAllBox}</TableHead> : null}
                    <TableHead className={verifier ? undefined : 'pl-4'}>Month</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Activity</TableHead>
                    <TableHead className="text-right">t CO2e</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden xl:table-cell">Added by</TableHead>
                    <TableHead className="pr-4">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((entry) => (
                    <TableRow key={entry.id} data-state={selected.has(entry.id) ? 'selected' : undefined}>
                      {verifier ? <TableCell className="pl-4">{selectBox(entry)}</TableCell> : null}
                      <TableCell className={cn('whitespace-nowrap text-muted-foreground', !verifier && 'pl-4')}>
                        {formatPeriod(entry.period)}
                      </TableCell>
                      <TableCell className="max-w-72">
                        {detailButton(entry, 'block max-w-full truncate')}
                        <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ background: `var(--scope-${entry.scope})` }}
                            aria-hidden
                          />
                          {SCOPE_INFO[entry.scope].label} · {entry.source.category}
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-right whitespace-nowrap text-muted-foreground tabular-nums lg:table-cell">
                        {formatNumber(entry.amount)} {unitLabel(entry.unit)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatTonnes(entry.co2eKg, 2)}</TableCell>
                      <TableCell>
                        <StatusBadge status={entry.status} />
                      </TableCell>
                      <TableCell className="hidden max-w-40 truncate text-muted-foreground xl:table-cell">
                        {entry.createdBy?.name ?? 'Former member'}
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-1">
                          {verifyButton(entry)}
                          {actionsMenu(entry)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
          {items.length > 0 ? (
            <div ref={listEnd} className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
              <span>
                Showing {formatNumber(items.length)}
                {total !== null ? ` of ${formatNumber(total)}` : null}
              </span>
              {hasNextPage ? (
                <Button size="sm" variant="outline" className="rounded-full" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                  {isFetchingNextPage ? 'Loading...' : 'Load more'}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </PageBody>

      {dialog?.kind === 'detail' ? (
        <EntryDetailDialog
          companyId={company.id}
          entry={items.find((entry) => entry.id === dialog.entry.id) ?? dialog.entry}
          actions={actionsFor(items.find((entry) => entry.id === dialog.entry.id) ?? dialog.entry)}
          onClose={() => setDialog(null)}
          onAction={(action) => openAction(dialog.entry, action)}
        />
      ) : null}
      {dialog?.kind === 'reject' ? (
        <RejectDialog entry={dialog.entry} onClose={() => setDialog(null)} onReject={runReview} />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <EditEntryDialog
          companyId={company.id}
          entry={dialog.entry}
          onClose={() => setDialog(null)}
          onSaved={(text) => toast.success(text)}
        />
      ) : null}
      {dialog?.kind === 'delete' ? (
        <DeleteEntryDialog
          entry={dialog.entry}
          onClose={() => setDialog(null)}
          onDelete={async () => {
            await remove.mutateAsync(dialog.entry.id)
            toast.success('Entry deleted')
          }}
        />
      ) : null}
    </>
  )
}

/**
 * Status filter as a segmented control with counts (radio buttons: one choice,
 * arrow keys move between them). Pending's count is amber while anything waits.
 */
function StatusTabs({
  value,
  counts,
  onChange,
}: {
  value: EntryStatus | null
  counts?: Record<EntryStatus, number>
  onChange: (status: EntryStatus | null) => void
}) {
  const all = counts ? counts.pending + counts.verified + counts.rejected : undefined
  const options: { value: EntryStatus | null; label: string; count?: number }[] = [
    { value: null, label: 'All', count: all },
    ...ENTRY_STATUSES.map((status) => ({ value: status, label: ENTRY_STATUS_LABELS[status], count: counts?.[status] })),
  ]
  return (
    // min-w-0: a fieldset is as wide as its content by default; phones scroll it sideways if needed
    <fieldset className="flex min-w-0 max-w-full overflow-x-auto rounded-full bg-muted p-1">
      <legend className="sr-only">Status</legend>
      {options.map((option) => {
        const Icon = option.value ? STATUS_STYLE[option.value].icon : null
        const attention = option.value === 'pending' && (option.count ?? 0) > 0
        return (
          <label
            key={option.label}
            className="flex h-7 cursor-pointer items-center gap-1 rounded-full px-2 text-sm sm:gap-1.5 sm:px-3 font-medium whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] hover:text-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50 motion-reduce:transition-none"
          >
            <input
              type="radio"
              name="entry-status"
              className="sr-only"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {Icon && option.value ? (
              <Icon className={cn('hidden size-3.5 sm:block', STATUS_STYLE[option.value].iconClass)} strokeWidth={2.5} aria-hidden />
            ) : null}
            {option.label}
            {option.count !== undefined ? (
              <span
                className={cn(
                  'min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums',
                  attention ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100' : 'text-muted-foreground',
                )}
              >
                {formatNumber(option.count)}
              </span>
            ) : null}
          </label>
        )
      })}
    </fieldset>
  )
}
