import { cn } from '@hub/ui/lib/utils'
import { ROLE_LABELS, type Role } from '@hub/shared/permissions'

/** Roles as pills: Admin solid, Manager outlined, Member quiet (roles aren't statuses: no status colours) */
const ROLE_PILL: Record<Role, string> = {
  admin: 'bg-foreground text-background',
  manager: 'bg-background text-foreground ring-1 ring-border ring-inset',
  member: 'bg-muted text-muted-foreground',
}

export function RolePill({ role, className }: { role: Role; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 w-fit items-center rounded-full px-2.5 text-xs font-medium', ROLE_PILL[role], className)}>
      {ROLE_LABELS[role]}
    </span>
  )
}
