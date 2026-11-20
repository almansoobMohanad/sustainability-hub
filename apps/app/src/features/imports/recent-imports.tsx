import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FileSpreadsheet, Undo2 } from 'lucide-react'
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
import { Skeleton } from '@hub/ui/components/skeleton'
import { toast } from '@hub/ui/components/sonner'
import { importActions } from '@hub/shared/imports'
import { InfoTip } from '@/components/info-tip'
import { useMe } from '@/features/company/me'
import { useLoadMore } from '@/hooks/use-load-more'
import { errorMessage } from '@/lib/api'
import { formatNumber } from '@/lib/format'
import { importsQueryOptions, useUndoImport, type EmissionImport } from './queries'

/*
  The company's imports, newest first (10 at a time, more on scroll or "Load
  more"): who imported which file, a link to its entries, and Undo (deletes the
  entries; the importer or a Manager/Admin, until a person verified one).
*/

const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
const entriesText = (count: number) => (count === 1 ? '1 entry' : `${formatNumber(count)} entries`)

export function RecentImports() {
  const me = useMe()
  const company = me.company!
  const imports = useInfiniteQuery(importsQueryOptions(company.id))
  const items = imports.data?.pages.flatMap((page) => page.items) ?? []
  const undo = useUndoImport(company.id)
  const [confirm, setConfirm] = useState<EmissionImport | null>(null)

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = imports
  const listEnd = useLoadMore({ hasMore: Boolean(hasNextPage), loading: isFetchingNextPage, loadMore: () => void fetchNextPage() })

  async function runUndo(item: EmissionImport) {
    try {
      const result = await undo.mutateAsync(item.id)
      toast.success(`Undid the import of ${result.fileName}: ${entriesText(item.remainingEntries)} deleted`)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  // Nothing imported yet: the section stays out of the way
  if (imports.isSuccess && items.length === 0) return null

  return (
    <section aria-labelledby="recent-imports" className="flex flex-col gap-3 pt-4">
      <h3 id="recent-imports" className="text-sm font-semibold">
        Recent imports
      </h3>
      <div className="overflow-hidden rounded-xl border">
        {imports.isPending ? (
          <div className="space-y-3 p-4" aria-label="Loading imports">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : imports.isError ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            {errorMessage(imports.error)}
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => {
              const actions = importActions(me.role, me.user.id, {
                createdById: item.createdBy?.id ?? null,
                undone: item.undoneAt !== null,
                verifiedByPerson: item.verifiedByPerson,
              })
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
                  </span>
                  {/* Phones: the details fill the line, so the actions wrap below them */}
                  <div className="min-w-0 flex-1 basis-[calc(100%-3.25rem)] sm:basis-0">
                    <p className="truncate font-medium">{item.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {entriesText(item.entryCount)}
                      {item.skippedRows > 0 ? ` · ${formatNumber(item.skippedRows)} skipped` : null} ·{' '}
                      {item.createdBy?.name ?? 'Former member'} · {dateTime.format(new Date(item.createdAt))}
                    </p>
                  </div>
                  {item.undoneAt ? (
                    // Phones: on its own line under the details (ml = icon width + gap)
                    <span className="ml-13 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground sm:ml-0">
                      Undone by {item.undoneBy?.name ?? 'a former member'}
                    </span>
                  ) : (
                    <div className="ml-13 flex items-center gap-1 sm:ml-0">
                      {item.remainingEntries > 0 ? (
                        <Button asChild size="sm" variant="ghost" className="h-8 rounded-full px-3">
                          <Link to="/emissions" search={{ year: 'all', import: item.id }}>
                            View entries
                          </Link>
                        </Button>
                      ) : null}
                      {actions.undo ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-full px-3"
                          disabled={undo.isPending}
                          onClick={() => setConfirm(item)}
                        >
                          <Undo2 aria-hidden />
                          Undo
                        </Button>
                      ) : actions.undoBlocked ? (
                        <span className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
                          Can&apos;t undo
                          <InfoTip label="Why this import can't be undone">{actions.undoBlocked}</InfoTip>
                        </span>
                      ) : null}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {hasNextPage ? (
          <div ref={listEnd} className="flex justify-end border-t px-4 py-3">
            <Button size="sm" variant="outline" className="rounded-full" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
              {isFetchingNextPage ? 'Loading...' : 'Load more'}
            </Button>
          </div>
        ) : null}
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo the import of {confirm?.fileName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes its {entriesText(confirm?.remainingEntries ?? 0)}. The audit trail keeps a record of each one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="rounded-full"
              onClick={() => {
                if (confirm) void runUndo(confirm)
                setConfirm(null)
              }}
            >
              Undo import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
