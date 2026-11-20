import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@hub/ui/components/alert-dialog'
import { Button } from '@hub/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hub/ui/components/dialog'
import { Input } from '@hub/ui/components/input'
import { Label } from '@hub/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hub/ui/components/select'
import { Skeleton } from '@hub/ui/components/skeleton'
import { Textarea } from '@hub/ui/components/textarea'
import { ENTRY_LIMITS, PERIOD_PATTERN, type EntryActions } from '@hub/shared/emissions'
import { formatFactor, perUnit, unitLabel } from '@/features/factors/format'
import { companySourcesQueryOptions } from '@/features/factors/queries'
import { errorMessage } from '@/lib/api'
import { currentPeriod, formatNumber, formatPeriod, formatTonnes } from '@/lib/format'
import { entryDetailQueryOptions, useUpdateEntry, type ReviewAction } from './queries'
import { StatusBadge } from './status-badge'
import { SCOPE_INFO, type EmissionEntry, type EntryEvent } from './types'

/*
  Dialogs of the Entries page: an entry's details with its history, reject
  (with a reason), edit, and delete confirmation. The API enforces every rule;
  these only offer what the person may do (entryActions in @hub/shared).
*/

const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

const EVENT_LABELS: Record<EntryEvent['action'], string> = {
  created: 'Added',
  updated: 'Edited',
  verified: 'Verified',
  rejected: 'Rejected',
  reopened: 'Reopened',
  deleted: 'Deleted',
}

function describeEvent(event: EntryEvent) {
  const who = event.details.automatic ? 'automatically (company setting)' : `by ${event.actor?.name ?? 'a former member'}`
  const extra =
    event.action === 'rejected' && typeof event.details.reason === 'string'
      ? `: "${event.details.reason}"`
      : event.action === 'updated'
        ? changesText(event.details)
        : event.details.bulk
          ? ' (with others)'
          : importText(event.details.import)
  return `${EVENT_LABELS[event.action]} ${who}${extra}`
}

/** "from fuel-2025.xlsx, row 14" for entries added by a spreadsheet import */
function importText(value: unknown) {
  if (!value || typeof value !== 'object') return ''
  const { fileName, row } = value as { fileName?: unknown; row?: unknown }
  return typeof fileName === 'string' ? ` from ${fileName}${typeof row === 'number' ? `, row ${row}` : ''}` : ''
}

/** A changed value as people read it: 8000 -> "8,000", "2026-03" -> "Mar 2026", "litres" -> "litres" */
function showValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === '') return 'empty'
  if (typeof value === 'number') return formatNumber(value)
  if (field === 'period' && typeof value === 'string' && PERIOD_PATTERN.test(value)) return formatPeriod(value)
  if (field === 'unit' && typeof value === 'string') return unitLabel(value)
  return String(value)
}

function changesText(details: Record<string, unknown>) {
  const changes = (details.changes ?? {}) as Record<string, { from: unknown; to: unknown }>
  const parts = Object.entries(changes)
    .filter(([field]) => field !== 'co2eKg')
    .map(([field, { from, to }]) => `${field === 'dataSource' ? 'data source' : field} ${showValue(field, from)} to ${showValue(field, to)}`)
  if (details.notesChanged) parts.push('notes')
  return parts.length ? `: ${parts.join(', ')}` : ''
}

export function EntryDetailDialog({
  companyId,
  entry,
  actions,
  onClose,
  onAction,
}: {
  companyId: string
  entry: EmissionEntry
  actions: EntryActions
  onClose: () => void
  onAction: (action: 'verify' | 'reject' | 'reopen' | 'edit' | 'delete') => void
}) {
  const detail = useQuery(entryDetailQueryOptions(companyId, entry.id))
  const current = detail.data ?? entry
  const rows: [string, ReactNode][] = [
    ['Reporting month', formatPeriod(current.period, 'long')],
    ['Source', `${current.source.name} (${SCOPE_INFO[current.scope].label} · ${current.source.category})`],
    ['Activity', `${formatNumber(current.amount)} ${unitLabel(current.unit)}`],
    [
      'Factor',
      `${formatFactor(current.kgCo2ePerUnit)} ${perUnit(current.unit)} (UK ${current.factorYear}${current.factorYear !== current.reportingYear ? `, used for ${current.reportingYear}` : ''})`,
    ],
    ['Emissions', `${formatNumber(current.co2eKg, 2)} kg CO2e (${formatTonnes(current.co2eKg, 3)} t)`],
    ['Data source', current.dataSource ?? 'Not given'],
  ]

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Entry details <StatusBadge status={current.status} />
          </DialogTitle>
          <DialogDescription>
            Added by {current.createdBy?.name ?? 'a former member'} on {dateTime.format(new Date(current.createdAt))}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-6 min-h-0 flex-1 space-y-5 overflow-y-auto px-6">
          {current.status === 'rejected' && current.rejectionReason ? (
            <p role="note" className="rounded-lg border border-destructive/30 px-3 py-2 text-sm">
              <span className="font-medium">Rejected:</span> {current.rejectionReason}
            </p>
          ) : null}
          <dl className="grid gap-2 text-sm sm:grid-cols-[9rem_1fr]">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="[overflow-wrap:anywhere]">{value}</dd>
              </div>
            ))}
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="whitespace-pre-line [overflow-wrap:anywhere]">
              {detail.isPending ? <Skeleton className="h-4 w-40" /> : (detail.data?.notes ?? 'Not given')}
            </dd>
          </dl>
          <section aria-labelledby="history-heading">
            <h3 id="history-heading" className="text-sm font-semibold">
              History
            </h3>
            {detail.isPending ? (
              <Skeleton className="mt-2 h-16 w-full" />
            ) : detail.isError ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {errorMessage(detail.error)}
              </p>
            ) : (
              <ol className="mt-2 space-y-2 border-l pl-4 text-sm">
                {detail.data.events.map((event, index) => (
                  <li key={index}>
                    <p>{describeEvent(event)}</p>
                    <p className="text-xs text-muted-foreground">{dateTime.format(new Date(event.createdAt))}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          {actions.verify ? (
            <Button className="rounded-full" onClick={() => onAction('verify')}>
              Verify
            </Button>
          ) : null}
          {actions.reject ? (
            <Button variant="outline" className="rounded-full" onClick={() => onAction('reject')}>
              Reject
            </Button>
          ) : null}
          {actions.reopen ? (
            <Button variant="outline" className="rounded-full" onClick={() => onAction('reopen')}>
              Reopen
            </Button>
          ) : null}
          {actions.edit ? (
            <Button variant="outline" className="rounded-full" onClick={() => onAction('edit')}>
              Edit
            </Button>
          ) : null}
          {actions.delete ? (
            <Button variant="ghost" className="rounded-full text-destructive" onClick={() => onAction('delete')}>
              Delete
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RejectDialog({
  entry,
  onClose,
  onReject,
}: {
  entry: EmissionEntry
  onClose: () => void
  onReject: (review: ReviewAction) => Promise<void>
}) {
  const id = useId()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tooShort = reason.trim().length < 3

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (tooShort) {
      setError('Give a short reason, so the person who added it knows what to fix.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onReject({ id: entry.id, action: 'reject', reason: reason.trim() })
      onClose()
    } catch (caught) {
      setError(errorMessage(caught))
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Reject entry</DialogTitle>
            <DialogDescription>
              {entry.source.name}, {formatPeriod(entry.period, 'long')}. The person who added it can correct it and send
              it back for verification.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={id}>Reason</Label>
            <Textarea
              id={id}
              rows={3}
              maxLength={ENTRY_LIMITS.rejectionReasonLength}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. The amount doesn't match the March invoice"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            {error ? (
              <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" className="rounded-full" disabled={busy}>
              {busy ? 'Rejecting...' : 'Reject entry'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function EditEntryDialog({
  companyId,
  entry,
  onClose,
  onSaved,
}: {
  companyId: string
  entry: EmissionEntry
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const id = useId()
  const update = useUpdateEntry(companyId)
  const detail = useQuery(entryDetailQueryOptions(companyId, entry.id))
  const [amount, setAmount] = useState(String(entry.amount))
  const [unit, setUnit] = useState(entry.unit)
  const [period, setPeriod] = useState(entry.period)
  const [dataSource, setDataSource] = useState(entry.dataSource ?? '')
  const [notes, setNotes] = useState<string | null>(null) // null: not touched (loaded with the detail)
  const [error, setError] = useState<string | null>(null)

  // The units this source can be measured in (from the company's sources, for the chosen year)
  const year = PERIOD_PATTERN.test(period) ? Number(period.slice(0, 4)) : entry.reportingYear
  const sources = useQuery(companySourcesQueryOptions(companyId, year))
  const units = sources.data?.sources.find((source) => source.id === entry.source.id)?.factors.map((f) => f.unit) ?? [entry.unit]

  async function submit(event: FormEvent) {
    event.preventDefault()
    const value = Number(amount)
    if (!(value > 0) || value > ENTRY_LIMITS.maxAmount) return setError('Enter an amount greater than 0.')
    if (!PERIOD_PATTERN.test(period) || period > currentPeriod()) return setError('Choose a reporting month that is not in the future.')
    setError(null)
    const changes = {
      ...(value !== entry.amount ? { amount: value } : {}),
      ...(unit !== entry.unit ? { unit } : {}),
      ...(period !== entry.period ? { period } : {}),
      ...(dataSource.trim() !== (entry.dataSource ?? '') ? { dataSource: dataSource.trim() || null } : {}),
      ...(notes !== null && notes.trim() !== (detail.data?.notes ?? '') ? { notes: notes.trim() || null } : {}),
    }
    if (Object.keys(changes).length === 0) return onClose()
    try {
      const saved = await update.mutateAsync({ id: entry.id, changes })
      onSaved(
        entry.status === 'rejected' && saved.status === 'pending'
          ? 'Entry corrected and sent back for verification.'
          : 'Entry saved.',
      )
      onClose()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Edit entry</DialogTitle>
            <DialogDescription>
              {entry.source.name}. To use a different source, delete this entry and add a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${id}-amount`}>Amount</Label>
              <Input
                id={`${id}-amount`}
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-unit`}>Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger id={`${id}-unit`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([...units, entry.unit])].map((option) => (
                    <SelectItem key={option} value={option}>
                      {unitLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-period`}>Reporting month</Label>
            <Input
              id={`${id}-period`}
              type="month"
              min={`${ENTRY_LIMITS.firstYear}-01`}
              max={currentPeriod()}
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-source`}>Data source</Label>
            <Input
              id={`${id}-source`}
              maxLength={ENTRY_LIMITS.dataSourceLength}
              value={dataSource}
              onChange={(event) => setDataSource(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-notes`}>Notes</Label>
            {detail.isPending ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <Textarea
                id={`${id}-notes`}
                rows={3}
                maxLength={ENTRY_LIMITS.notesLength}
                value={notes ?? detail.data?.notes ?? ''}
                onChange={(event) => setNotes(event.target.value)}
              />
            )}
          </div>
          {entry.status === 'rejected' ? (
            <p className="text-sm text-muted-foreground">Saving sends the entry back for verification.</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-full" disabled={update.isPending}>
              {update.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteEntryDialog({
  entry,
  onClose,
  onDelete,
}: {
  entry: EmissionEntry
  onClose: () => void
  onDelete: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
          <AlertDialogDescription>
            {entry.source.name}, {formatPeriod(entry.period, 'long')}: {formatNumber(entry.amount)} {unitLabel(entry.unit)}.
            The history keeps a record that it was deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-full bg-destructive text-white hover:bg-destructive/90"
            disabled={busy}
            onClick={async (event) => {
              event.preventDefault() // keep the dialog open until it's done
              setBusy(true)
              setError(null)
              try {
                await onDelete()
                onClose()
              } catch (caught) {
                setError(errorMessage(caught))
                setBusy(false)
              }
            }}
          >
            {busy ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
