import { AlertCircle, Check, LoaderCircle } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import type { Person } from './queries'
import { editedWhen } from './time'
import type { SaveStatus } from './use-autosave'

/** "Saved · edited by Aisyah, 2 minutes ago", "Saving...", or a failed save with Retry */
export function SaveLine({
  status,
  updatedAt,
  updatedBy,
  onRetry,
}: {
  status: SaveStatus
  updatedAt: string | null
  updatedBy: Person
  onRetry: () => void
}) {
  if (status.state === 'failed') {
    return (
      <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        <AlertCircle className="size-4" aria-hidden />
        Couldn&apos;t save: {status.message}
        <Button variant="outline" size="sm" className="h-7 rounded-full" onClick={onRetry}>
          Retry
        </Button>
      </p>
    )
  }
  const busy = status.state === 'waiting' || status.state === 'saving'
  return (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-live="polite">
      {busy ? (
        <>
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          Saving...
        </>
      ) : updatedAt ? (
        <>
          <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          Saved · edited by {updatedBy?.name ?? 'a former member'}, {editedWhen(updatedAt)}
        </>
      ) : (
        'Not started yet'
      )}
    </p>
  )
}
