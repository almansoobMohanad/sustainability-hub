import { CircleCheck, CircleX, Clock } from 'lucide-react'
import { Badge } from '@hub/ui/components/badge'
import { ENTRY_STATUS_LABELS, type EntryStatus } from '@hub/shared/emissions'

/*
  Verification status: always icon + label, never colour alone. Only the icon
  carries the status colour; the label stays in normal text colour.
*/
const STATUS = {
  verified: { icon: CircleCheck, iconClass: 'text-[#0ca30c]' },
  pending: { icon: Clock, iconClass: 'text-muted-foreground' },
  rejected: { icon: CircleX, iconClass: 'text-[#d03b3b]' },
} satisfies Record<EntryStatus, unknown>

export function StatusBadge({ status }: { status: EntryStatus }) {
  const { icon: Icon, iconClass } = STATUS[status]
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <Icon className={`size-3 ${iconClass}`} aria-hidden />
      {ENTRY_STATUS_LABELS[status]}
    </Badge>
  )
}
