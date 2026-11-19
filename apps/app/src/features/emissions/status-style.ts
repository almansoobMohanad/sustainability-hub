import { CircleCheck, CircleX, Clock, type LucideIcon } from 'lucide-react'
import type { EntryStatus } from '@hub/shared/emissions'

/*
  How each verification status looks. Always icon + label (never colour alone).
  Soft tinted pills (user feedback 2026-11-19: Pending must stand out, and the
  old thin grey clock / small green tick were hard to tell apart):
  - Pending  = amber clock: something is waiting for a Manager or Admin
  - Verified = green tick (bold stroke, so it reads at 14px)
  - Rejected = red cross
  Label text uses the dark shade of each tone (contrast > 7:1 on its tint).
*/
export const STATUS_STYLE: Record<EntryStatus, { icon: LucideIcon; pill: string; iconClass: string }> = {
  pending: {
    icon: Clock,
    pill: 'bg-amber-50 text-amber-900 ring-amber-300/70 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  verified: {
    icon: CircleCheck,
    pill: 'bg-emerald-50 text-emerald-900 ring-emerald-300/70 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
  },
  rejected: {
    icon: CircleX,
    pill: 'bg-red-50 text-red-900 ring-red-300/70 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-800',
    iconClass: 'text-red-600 dark:text-red-400',
  },
}
