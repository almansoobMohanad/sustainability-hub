import { CircleCheck, CircleX, Clock } from 'lucide-react'
import { Badge } from '@hub/ui/components/badge'
import type { VerificationStatus } from './types'

/*
  Verification status: always icon + label, never colour alone. Only the icon
  carries the status colour; the label stays in normal text colour.
*/
const STATUS = {
  verified: { label: 'Verified', icon: CircleCheck, iconClass: 'text-[#0ca30c]' },
  unverified: { label: 'Unverified', icon: Clock, iconClass: 'text-muted-foreground' },
  rejected: { label: 'Rejected', icon: CircleX, iconClass: 'text-[#d03b3b]' },
} satisfies Record<VerificationStatus, unknown>

export function StatusBadge({ status }: { status: VerificationStatus }) {
  const { label, icon: Icon, iconClass } = STATUS[status]
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <Icon className={`size-3 ${iconClass}`} aria-hidden />
      {label}
    </Badge>
  )
}
