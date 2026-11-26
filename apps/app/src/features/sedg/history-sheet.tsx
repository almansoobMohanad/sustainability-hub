import { useInfiniteQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@hub/ui/components/sheet'
import { Skeleton } from '@hub/ui/components/skeleton'
import { errorMessage } from '@/lib/api'
import { sedgHistoryQueryOptions } from './queries'
import { whenText } from './time'

/*
  The report's history in a side panel: who edited it, when, and which
  disclosures. A person's saves close together are one line (the API merges
  them), so this reads like "Aisyah edited E2.1, E3.1 at 14:05 to 14:20".
  Loaded only when opened; 20 per page with "Show older".
*/

export function HistorySheet({ companyId, year }: { companyId: string; year: number }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 rounded-full">
          <History aria-hidden />
          History
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>History of the {year} report</SheetTitle>
          <SheetDescription>Who edited it and what they changed, newest first.</SheetDescription>
        </SheetHeader>
        <HistoryList companyId={companyId} year={year} />
      </SheetContent>
    </Sheet>
  )
}

function HistoryList({ companyId, year }: { companyId: string; year: number }) {
  const history = useInfiniteQuery(sedgHistoryQueryOptions(companyId, year))
  const items = history.data?.pages.flatMap((page) => page.items) ?? []

  if (history.isPending) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }
  if (history.isError) return <p className="p-4 text-sm text-destructive">{errorMessage(history.error)}</p>
  if (items.length === 0) return <p className="p-4 text-sm text-muted-foreground">No changes yet.</p>

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ol className="divide-y">
        {items.map((edit) => (
          <li key={edit.id} className="flex flex-col gap-1.5 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-sm font-medium">{edit.actor?.name ?? 'A former member'}</span>
              <time dateTime={edit.endedAt} className="text-xs text-muted-foreground">
                {whenText(edit.startedAt, edit.endedAt)}
              </time>
            </div>
            <div className="flex flex-wrap gap-1" aria-label="Changed">
              {edit.changed.map((part) => (
                <span key={part} className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums">
                  {part === 'Level' ? 'Report level' : part === 'General' ? 'General information' : part}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {history.hasNextPage ? (
        <div className="p-4">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
          >
            {history.isFetchingNextPage ? 'Loading...' : 'Show older'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
