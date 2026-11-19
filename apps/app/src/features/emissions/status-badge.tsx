import { ENTRY_STATUS_LABELS, type EntryStatus } from '@hub/shared/emissions'
import { cn } from '@hub/ui/lib/utils'
import { STATUS_STYLE } from './status-style'

/** Verification status as a soft tinted pill: icon + label (see status-style.ts). */
export function StatusBadge({ status, className }: { status: EntryStatus; className?: string }) {
  const { icon: Icon, pill, iconClass } = STATUS_STYLE[status]
  return (
    <span
      className={cn(
        'inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full py-0.5 pr-2.5 pl-1.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        pill,
        className,
      )}
    >
      <Icon className={cn('size-3.5', iconClass)} strokeWidth={2.5} aria-hidden />
      {ENTRY_STATUS_LABELS[status]}
    </span>
  )
}
