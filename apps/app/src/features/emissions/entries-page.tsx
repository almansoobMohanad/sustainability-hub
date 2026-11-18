import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { CircleAlert, CircleCheck, CirclePlus, MoreHorizontal } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import { Card, CardContent } from '@hub/ui/components/card'
import { Checkbox } from '@hub/ui/components/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@hub/ui/components/dropdown-menu'
import { Label } from '@hub/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hub/ui/components/select'
import { Skeleton } from '@hub/ui/components/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hub/ui/components/table'
import { ENTRY_LIMITS, ENTRY_STATUSES, ENTRY_STATUS_LABELS, entryActions, type EntryStatus } from '@hub/shared/emissions'
import { can } from '@hub/shared/permissions'
import { PageHeader } from '@/components/page-header'
import { useMe } from '@/features/company/me'
import { unitLabel } from '@/features/factors/format'
import { useLoadMore } from '@/hooks/use-load-more'
import { errorMessage } from '@/lib/api'
import { formatNumber, formatPeriod, formatTonnes } from '@/lib/format'
import { DeleteEntryDialog, EditEntryDialog, EntryDetailDialog, RejectDialog } from './entry-dialogs'
import {
  entriesQueryOptions,
  summaryQueryOptions,
  useBulkVerify,
  useDeleteEntry,
  useReviewEntry,
  type ReviewAction,
} from './queries'
import { StatusBadge } from './status-badge'
import { SCOPES, SCOPE_INFO, type EmissionEntry, type Scope } from './types'

/*
  Entries: the company's emissions data, newest reporting month first.
  Filters (year, status, scope) live in the URL, so a link like "Pending
  entries of 2026" works, and they're applied by the server. 30 entries load at
  a time; more load when the end of the table scrolls into view.

  Managers and Admins verify, reject (with a reason) and reopen entries, also
  several Pending ones at once. Everyone can open an entry to see its notes
  and history, and edit or delete their own entries until they're verified.
*/

type Dialog = { kind: 'detail' | 'reject' | 'edit' | 'delete'; entry: EmissionEntry } | null
type Feedback = { tone: 'error' | 'success'; text: string } | null
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
  const actionsFor = (entry: EmissionEntry) =>
    entryActions(me.role, me.user.id, { status: entry.status, createdById: entry.createdBy?.id ?? null })

  // Selection for bulk verify; it belongs to the current filters and is forgotten when they change
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({ key: filtersKey, ids: new Set() })
  const selected = selection.key === filtersKey ? selection.ids : new Set<string>()
  const pendingOnScreen = items.filter((entry) => entry.status === 'pending')
  const setSelected = (ids: Set<string>) => setSelection({ key: filtersKey, ids })

  const [dialog, setDialog] = useState<Dialog>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
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
    setFeedback(null)
    void navigate({ search: (previous) => ({ ...previous, ...changes }), replace: true })
  }

  async function runReview(action: ReviewAction) {
    setFeedback(null)
    const done = { verify: 'Entry verified.', reject: 'Entry rejected.', reopen: 'Entry reopened: it is Pending again.' }
    await review.mutateAsync(action)
    setFeedback({ tone: 'success', text: done[action.action] })
  }

  async function quickReview(action: ReviewAction) {
    try {
      await runReview(action)
      setDialog(null)
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error) })
    }
  }

  async function verifySelected() {
    setFeedback(null)
    try {
      const result = await bulk.mutateAsync([...selected])
      setSelected(new Set())
      setFeedback({
        tone: 'success',
        text: `${result.verified} ${result.verified === 1 ? 'entry' : 'entries'} verified${result.skipped ? ` (${result.skipped} skipped: no longer Pending)` : ''}.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error) })
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
      <PageHeader
        title="Entries"
        actions={
          <Button asChild size="sm" className="rounded-full px-3">
            <Link to="/emissions/new">
              <CirclePlus data-icon="inline-start" aria-hidden />
              Add emissions
            </Link>
          </Button>
        }
      />
      <div className="flex flex-col gap-4 p-4 md:p-6">
        {/* Filters: one row above the table they affect */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="entries-year" className="text-muted-foreground">
              Year
            </Label>
            <Select value={year ? String(year) : ALL} onValueChange={(value) => setFilter({ year: value === ALL ? 'all' : Number(value) })}>
              <SelectTrigger id="entries-year" className="w-32">
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
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="entries-status" className="text-muted-foreground">
              Status
            </Label>
            <Select
              value={filters.status ?? ALL}
              onValueChange={(value) => setFilter({ status: value === ALL ? undefined : (value as EntryStatus) })}
            >
              <SelectTrigger id="entries-status" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {ENTRY_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {ENTRY_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="entries-scope" className="text-muted-foreground">
              Scope
            </Label>
            <Select
              value={filters.scope ? String(filters.scope) : ALL}
              onValueChange={(value) => setFilter({ scope: value === ALL ? undefined : (Number(value) as Scope) })}
            >
              <SelectTrigger id="entries-scope" className="w-32">
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
          </div>
          {filtered ? (
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => void navigate({ search: {}, replace: true })}>
              Reset filters
            </Button>
          ) : null}
        </div>

        {feedback ? (
          <p
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            className={
              feedback.tone === 'error'
                ? 'flex items-start gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive'
                : 'flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
            }
          >
            {feedback.tone === 'error' ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            {feedback.text}
          </p>
        ) : null}

        {verifier && selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 px-4 py-2 text-sm">
            <span>
              {selected.size} {selected.size === 1 ? 'entry' : 'entries'} selected
            </span>
            <Button size="sm" className="rounded-full" disabled={bulk.isPending} onClick={verifySelected}>
              {bulk.isPending ? 'Verifying...' : 'Verify selected'}
            </Button>
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </div>
        ) : null}

        <Card className="py-0">
          <CardContent className="px-0">
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
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <p className="font-medium">{filtered || year ? 'No entries match these filters' : 'No entries yet'}</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {year && !filters.status && !filters.scope
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
                    <li className="flex items-center gap-3 px-4 py-2 text-sm text-muted-foreground">
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
                        <div className="mt-1.5 flex items-center gap-2">
                          <StatusBadge status={entry.status} />
                          <span className="text-sm font-medium tabular-nums">{formatTonnes(entry.co2eKg, 2)} t</span>
                        </div>
                      </div>
                      {actionsMenu(entry)}
                    </li>
                  ))}
                </ul>

                <Table className="hidden md:table">
                  <TableHeader>
                    <TableRow>
                      {verifier ? <TableHead className="w-10 pl-4">{selectAllBox}</TableHead> : null}
                      <TableHead className={verifier ? undefined : 'pl-4'}>Month</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="hidden text-right lg:table-cell">Activity</TableHead>
                      <TableHead className="text-right">t CO2e</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden xl:table-cell">Added by</TableHead>
                      <TableHead className="w-12 pr-4">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((entry) => (
                      <TableRow key={entry.id} data-state={selected.has(entry.id) ? 'selected' : undefined}>
                        {verifier ? <TableCell className="pl-4">{selectBox(entry)}</TableCell> : null}
                        <TableCell className={`whitespace-nowrap ${verifier ? '' : 'pl-4'}`}>{formatPeriod(entry.period)}</TableCell>
                        <TableCell className="max-w-64">
                          {detailButton(entry, 'block max-w-full truncate')}
                          <span className="block truncate text-xs text-muted-foreground">
                            {SCOPE_INFO[entry.scope].label} · {entry.source.category}
                          </span>
                        </TableCell>
                        <TableCell className="hidden text-right whitespace-nowrap tabular-nums lg:table-cell">
                          {formatNumber(entry.amount)} {unitLabel(entry.unit)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatTonnes(entry.co2eKg, 2)}</TableCell>
                        <TableCell>
                          <StatusBadge status={entry.status} />
                        </TableCell>
                        <TableCell className="hidden max-w-40 truncate text-muted-foreground xl:table-cell">
                          {entry.createdBy?.name ?? 'Former member'}
                        </TableCell>
                        <TableCell className="pr-4">{actionsMenu(entry)}</TableCell>
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
          </CardContent>
        </Card>
      </div>

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
          onSaved={(text) => setFeedback({ tone: 'success', text })}
        />
      ) : null}
      {dialog?.kind === 'delete' ? (
        <DeleteEntryDialog
          entry={dialog.entry}
          onClose={() => setDialog(null)}
          onDelete={async () => {
            await remove.mutateAsync(dialog.entry.id)
            setFeedback({ tone: 'success', text: 'Entry deleted.' })
          }}
        />
      ) : null}
    </>
  )
}
