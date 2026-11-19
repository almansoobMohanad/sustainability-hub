import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Clock, LogOut, Mail, UserMinus, UserPlus, type LucideIcon } from 'lucide-react'
import { z } from 'zod'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@hub/ui/components/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@hub/ui/components/avatar'
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
import { toast } from '@hub/ui/components/sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hub/ui/components/table'
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, can, isRole, type Role } from '@hub/shared/permissions'
import { InfoTip } from '@/components/info-tip'
import { PageHeader } from '@/components/page-header'
import { PageBody, PageTitle } from '@/components/page-layout'
import { authClient } from '@/lib/auth-client'
import { NETWORK_ERROR_MESSAGE } from '@/features/auth/auth-errors'
import { companyErrorMessage } from './company-errors'
import { forgetCompanyData, useMe } from './me'
import { RolePill } from './role-pill'

/*
  Members of the active company: who's in it, their roles, pending invitations.
  What you can do depends on your role (packages/shared/src/permissions.ts);
  the API enforces the same rules, so hiding a button is only a convenience.
  Outcomes are shown as toasts.
*/

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() || '?'
}

export function MembersPage() {
  const me = useMe()
  const company = me.company!
  const myRole = me.role
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)

  const companyKey = ['company', company.id] as const
  const full = useQuery({
    queryKey: [...companyKey, 'full'],
    queryFn: async () => {
      const { data, error } = await authClient.organization.getFullOrganization({
        query: { organizationId: company.id },
      })
      if (error || !data) throw new Error(companyErrorMessage(error ?? { status: 500 }))
      return data
    },
  })

  const canInvite = can(myRole, 'invitation', 'create')
  const canCancelInvites = can(myRole, 'invitation', 'cancel')
  const canChangeRoles = can(myRole, 'member', 'update')
  const canRemove = can(myRole, 'member', 'delete')

  /** Runs a change, shows the outcome, refreshes the lists. */
  async function run(id: string, action: () => Promise<{ error: unknown }>, success: string) {
    setBusyId(id)
    try {
      const { error } = await action()
      if (error) toast.error(companyErrorMessage(error as { status: number; code?: string }))
      else {
        toast.success(success)
        await queryClient.invalidateQueries({ queryKey: companyKey })
      }
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE)
    } finally {
      setBusyId(null)
    }
  }

  async function leave() {
    setBusyId('leave')
    try {
      const { error } = await authClient.organization.leave({ organizationId: company.id })
      if (error) {
        toast.error(companyErrorMessage(error))
        setBusyId(null)
        return
      }
      forgetCompanyData(queryClient)
      await navigate({ to: '/' }) // the guard picks another company, or "create a company"
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE)
      setBusyId(null)
    }
  }

  const now = new Date()
  const members = full.data?.members ?? []
  const pending = (full.data?.invitations ?? []).filter(
    (invitation) => invitation.status === 'pending' && new Date(invitation.expiresAt) > now,
  )

  return (
    <>
      <PageHeader title="Members" />
      <PageBody className="max-w-5xl">
        <PageTitle
          title="Members"
          info={
            <>
              <span>
                You&apos;re {myRole === 'admin' ? 'an' : 'a'} {myRole ? ROLE_LABELS[myRole] : 'member'} of {company.name}.
              </span>
              {ROLES.map((role) => (
                <span key={role}>
                  <span className="font-medium">{ROLE_LABELS[role]}:</span> {ROLE_DESCRIPTIONS[role]}
                </span>
              ))}
            </>
          }
          actions={
            canInvite ? (
              <Button className="h-9 rounded-full px-4" onClick={() => setInviteOpen(true)}>
                <UserPlus aria-hidden />
                Invite people
              </Button>
            ) : null
          }
        />

        <div className="overflow-hidden rounded-xl border">
          {full.isError ? (
            <p role="alert" className="p-4 text-sm text-destructive">
              {full.error.message}
            </p>
          ) : (
            <Table>
              <TableHeader className="bg-muted/40 [&_th]:h-10 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">
                    Person
                    {full.data ? <span className="ml-1.5 tabular-nums">· {members.length}</span> : null}
                  </TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden sm:table-cell">Joined</TableHead>
                  <TableHead className="pr-4 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Placeholder rows while loading, so an empty table never reads as "no members" */}
                {full.isPending
                  ? [0, 1, 2].map((i) => (
                      <TableRow key={`loading-${i}`} aria-hidden>
                        <TableCell className="pl-4">
                          <div className="flex items-center gap-3">
                            <Skeleton className="size-8 rounded-full" />
                            <span className="space-y-1.5">
                              <Skeleton className="h-3.5 w-32" />
                              <Skeleton className="h-3 w-44" />
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-6 w-20 rounded-full" />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Skeleton className="h-3.5 w-20" />
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    ))
                  : null}
                {members.map((member) => {
                  const isMe = member.userId === me.user.id
                  const role: Role = isRole(member.role) ? member.role : 'member'
                  return (
                    <TableRow key={member.id}>
                      {/* w-full max-w-0: the person column takes the spare width and truncates on phones */}
                      <TableCell className="w-full max-w-0 pl-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar className="size-8">
                            {member.user.image ? (
                              <AvatarImage src={member.user.image} alt="" referrerPolicy="no-referrer" />
                            ) : null}
                            <AvatarFallback className="text-xs">{initials(member.user.name)}</AvatarFallback>
                          </Avatar>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {member.user.name}
                              {isMe ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">{member.user.email}</span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {canChangeRoles && !isMe ? (
                          <Select
                            value={role}
                            disabled={busyId === member.id}
                            onValueChange={(value) =>
                              run(
                                member.id,
                                () =>
                                  authClient.organization.updateMemberRole({
                                    memberId: member.id,
                                    role: value as Role,
                                    organizationId: company.id,
                                  }),
                                `${member.user.name} is now ${value === 'admin' ? 'an' : 'a'} ${ROLE_LABELS[value as Role]}`,
                              )
                            }
                          >
                            <SelectTrigger className="w-28 rounded-full sm:w-32" aria-label={`Role of ${member.user.name}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {ROLE_LABELS[option]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <RolePill role={role} />
                        )}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                        {dateFormat.format(new Date(member.createdAt))}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        {isMe ? (
                          <ConfirmButton
                            label="Leave"
                            icon={LogOut}
                            title={`Leave ${company.name}?`}
                            description="You'll lose access to this company's data. An Admin would need to invite you again."
                            confirm="Leave company"
                            busy={busyId === 'leave'}
                            onConfirm={leave}
                          />
                        ) : canRemove ? (
                          <ConfirmButton
                            label="Remove"
                            icon={UserMinus}
                            title={`Remove ${member.user.name}?`}
                            description={`They'll lose access to ${company.name} straight away. You can invite them again later.`}
                            confirm="Remove"
                            busy={busyId === member.id}
                            onConfirm={() =>
                              run(
                                member.id,
                                () =>
                                  authClient.organization.removeMember({
                                    memberIdOrEmail: member.id,
                                    organizationId: company.id,
                                  }),
                                `${member.user.name} was removed`,
                              )
                            }
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {pending.length > 0 ? (
          <section aria-labelledby="pending-invitations" className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5">
              <h3 id="pending-invitations" className="text-sm font-semibold">
                Pending invitations
              </h3>
              <span className="rounded-full bg-amber-100 px-1.5 text-xs font-medium tabular-nums text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">
                {pending.length}
              </span>
              <InfoTip label="About invitations">
                Invitations expire after 7 days and work only for that email address. Inviting the same email again
                sends a fresh link.
              </InfoTip>
            </div>
            <ul className="divide-y overflow-hidden rounded-xl border">
              {pending.map((invitation) => (
                <li key={invitation.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Mail className="size-4 text-muted-foreground" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate font-medium">{invitation.email}</span>
                    <span className="text-xs text-muted-foreground">
                      {isRole(invitation.role) ? ROLE_LABELS[invitation.role] : invitation.role} · expires{' '}
                      {dateFormat.format(new Date(invitation.expiresAt))}
                    </span>
                  </span>
                  <span className="hidden h-6 shrink-0 items-center gap-1 rounded-full bg-amber-50 py-0.5 pr-2.5 pl-1.5 text-xs font-medium text-amber-900 ring-1 ring-amber-300/70 ring-inset sm:inline-flex dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800">
                    <Clock className="size-3.5 text-amber-600 dark:text-amber-400" strokeWidth={2.5} aria-hidden />
                    Invited
                  </span>
                  {canCancelInvites ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 rounded-full text-muted-foreground"
                      disabled={busyId === invitation.id}
                      onClick={() =>
                        run(
                          invitation.id,
                          () => authClient.organization.cancelInvitation({ invitationId: invitation.id }),
                          `Invitation to ${invitation.email} cancelled`,
                        )
                      }
                    >
                      {busyId === invitation.id ? 'Cancelling...' : 'Cancel'}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </PageBody>

      {canInvite ? (
        <InviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          myRole={myRole}
          onInvited={async (email) => {
            toast.success(`Invitation sent to ${email}`)
            await queryClient.invalidateQueries({ queryKey: companyKey })
          }}
        />
      ) : null}
    </>
  )
}

/** A small button that asks for confirmation before doing something hard to undo. */
function ConfirmButton(props: {
  label: string
  /** Shown instead of the label on phones (the label stays as the accessible name) */
  icon: LucideIcon
  title: string
  description: string
  confirm: string
  busy: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={props.label}
          className="size-8 rounded-full p-0 text-destructive hover:text-destructive sm:w-auto sm:px-2.5"
          disabled={props.busy}
        >
          <props.icon className="sm:hidden" aria-hidden />
          <span className="hidden sm:inline">{props.busy ? 'Working...' : props.label}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={props.onConfirm}>
            {props.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const inviteSchema = z.object({
  email: z.string().trim().min(1, 'Enter an email address').pipe(z.email('Enter a valid email address')),
  role: z.enum(ROLES),
})
type InviteValues = z.infer<typeof inviteSchema>

function InviteDialog({
  open,
  onOpenChange,
  myRole,
  onInvited,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  myRole: Role | null
  onInvited: (email: string) => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), defaultValues: { email: '', role: 'member' } })
  // useWatch (not watch()) so React's compiler can optimise this component safely
  const selectedRole = useWatch({ control, name: 'role' })
  // Only Admins may hand out the Admin role (Better Auth enforces this too)
  const grantable = ROLES.filter((role) => role !== 'admin' || myRole === 'admin')

  async function onSubmit({ email, role }: InviteValues) {
    setError(null)
    try {
      const { error } = await authClient.organization.inviteMember({ email, role, resend: true })
      if (error) {
        setError(companyErrorMessage(error))
        return
      }
      reset({ email: '', role })
      onOpenChange(false)
      await onInvited(email)
    } catch {
      setError(NETWORK_ERROR_MESSAGE)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite someone</DialogTitle>
          <DialogDescription>They&apos;ll get an email with a link to join. It works only for that address.</DialogDescription>
        </DialogHeader>
        <form id="invite-form" onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              spellCheck={false}
              placeholder="colleague@company.com"
              className="h-10"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'invite-email-error' : undefined}
              {...register('email')}
            />
            {errors.email ? (
              <p id="invite-email-error" className="text-sm text-destructive">
                {errors.email.message}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-role">Role</Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="invite-role" className="w-full data-[size=default]:h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {grantable.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[selectedRole]}</p>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form" className="rounded-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending...' : 'Send invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
