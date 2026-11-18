import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CircleAlert, CircleCheck, UserPlus } from 'lucide-react'
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
import { Badge } from '@hub/ui/components/badge'
import { Button } from '@hub/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hub/ui/components/card'
import { Input } from '@hub/ui/components/input'
import { Label } from '@hub/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hub/ui/components/select'
import { Skeleton } from '@hub/ui/components/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hub/ui/components/table'
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, can, isRole, type Role } from '@hub/shared/permissions'
import { PageHeader } from '@/components/page-header'
import { authClient } from '@/lib/auth-client'
import { NETWORK_ERROR_MESSAGE } from '@/features/auth/auth-errors'
import { companyErrorMessage } from './company-errors'
import { forgetCompanyData, useMe } from './me'

/*
  Members of the active company: who's in it, their roles, pending invitations.
  What you can do depends on your role (packages/shared/src/permissions.ts);
  the API enforces the same rules, so hiding a button is only a convenience.
*/

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() || '?'
}

type Feedback = { tone: 'error' | 'success'; text: string } | null

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null
  const Icon = feedback.tone === 'error' ? CircleAlert : CircleCheck
  return (
    <p
      role={feedback.tone === 'error' ? 'alert' : 'status'}
      className={
        feedback.tone === 'error'
          ? 'flex items-start gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive'
          : 'flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      {feedback.text}
    </p>
  )
}

export function MembersPage() {
  const me = useMe()
  const company = me.company!
  const myRole = me.role
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

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
    setFeedback(null)
    try {
      const { error } = await action()
      if (error) setFeedback({ tone: 'error', text: companyErrorMessage(error as { status: number; code?: string }) })
      else {
        setFeedback({ tone: 'success', text: success })
        await queryClient.invalidateQueries({ queryKey: companyKey })
      }
    } catch {
      setFeedback({ tone: 'error', text: NETWORK_ERROR_MESSAGE })
    } finally {
      setBusyId(null)
    }
  }

  async function leave() {
    setBusyId('leave')
    setFeedback(null)
    try {
      const { error } = await authClient.organization.leave({ organizationId: company.id })
      if (error) {
        setFeedback({ tone: 'error', text: companyErrorMessage(error) })
        setBusyId(null)
        return
      }
      forgetCompanyData(queryClient)
      await navigate({ to: '/' }) // the guard picks another company, or "create a company"
    } catch {
      setFeedback({ tone: 'error', text: NETWORK_ERROR_MESSAGE })
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
      <div className="grid w-full max-w-5xl gap-6 p-4 md:p-6">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-tight">People in {company.name}</h2>
          <p className="text-sm text-muted-foreground">
            You&apos;re {myRole === 'admin' ? 'an' : 'a'} {myRole ? ROLE_LABELS[myRole] : 'member'}.{' '}
            {myRole ? ROLE_DESCRIPTIONS[myRole] : null}
          </p>
        </div>

        <FeedbackMessage feedback={feedback} />

        {canInvite ? (
          <InviteForm
            myRole={myRole}
            onInvited={async (email) => {
              setFeedback({ tone: 'success', text: `Invitation sent to ${email}.` })
              await queryClient.invalidateQueries({ queryKey: companyKey })
            }}
            onError={(text) => setFeedback({ tone: 'error', text })}
          />
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              {full.isPending ? 'Loading...' : `${members.length} ${members.length === 1 ? 'person' : 'people'}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {full.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {full.error.message}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead className="w-40">Role</TableHead>
                    <TableHead className="hidden w-32 sm:table-cell">Joined</TableHead>
                    <TableHead className="w-28 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Placeholder rows while loading, so an empty table never reads as "no members" */}
                  {full.isPending
                    ? [0, 1, 2].map((i) => (
                        <TableRow key={`loading-${i}`} aria-hidden>
                          <TableCell>
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
                        <TableCell>
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
                                  `${member.user.name} is now ${value === 'admin' ? 'an' : 'a'} ${ROLE_LABELS[value as Role]}.`,
                                )
                              }
                            >
                              <SelectTrigger className="h-8 w-36" aria-label={`Role of ${member.user.name}`}>
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
                            <Badge variant={role === 'admin' ? 'default' : 'secondary'}>{ROLE_LABELS[role]}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {dateFormat.format(new Date(member.createdAt))}
                        </TableCell>
                        <TableCell className="text-right">
                          {isMe ? (
                            <ConfirmButton
                              label="Leave"
                              title={`Leave ${company.name}?`}
                              description="You'll lose access to this company's data. An Admin would need to invite you again."
                              confirm="Leave company"
                              busy={busyId === 'leave'}
                              onConfirm={leave}
                            />
                          ) : canRemove ? (
                            <ConfirmButton
                              label="Remove"
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
                                  `${member.user.name} was removed.`,
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
          </CardContent>
        </Card>

        {pending.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Pending invitations</CardTitle>
              <CardDescription>Invitations expire after 7 days. Re-inviting an email sends a fresh one.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {pending.map((invitation) => (
                  <li key={invitation.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="min-w-0 text-sm">
                      <span className="block truncate font-medium">{invitation.email}</span>
                      <span className="text-muted-foreground">
                        {isRole(invitation.role) ? ROLE_LABELS[invitation.role] : invitation.role} · expires{' '}
                        {dateFormat.format(new Date(invitation.expiresAt))}
                      </span>
                    </span>
                    {canCancelInvites ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 rounded-full"
                        disabled={busyId === invitation.id}
                        onClick={() =>
                          run(
                            invitation.id,
                            () => authClient.organization.cancelInvitation({ invitationId: invitation.id }),
                            `Invitation to ${invitation.email} cancelled.`,
                          )
                        }
                      >
                        {busyId === invitation.id ? 'Cancelling...' : 'Cancel'}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  )
}

/** A small button that asks for confirmation before doing something hard to undo. */
function ConfirmButton(props: {
  label: string
  title: string
  description: string
  confirm: string
  busy: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={props.busy}>
          {props.busy ? 'Working...' : props.label}
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

function InviteForm({
  myRole,
  onInvited,
  onError,
}: {
  myRole: Role | null
  onInvited: (email: string) => Promise<void>
  onError: (message: string) => void
}) {
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
    try {
      const { error } = await authClient.organization.inviteMember({ email, role, resend: true })
      if (error) {
        onError(companyErrorMessage(error))
        return
      }
      reset({ email: '', role })
      await onInvited(email)
    } catch {
      onError(NETWORK_ERROR_MESSAGE)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="size-4 text-muted-foreground" aria-hidden />
          Invite someone
        </CardTitle>
        <CardDescription>They&apos;ll get an email with a link to join. It works only for that email address.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-start">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              spellCheck={false}
              placeholder="colleague@company.com"
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
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="invite-role" className="w-full">
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
          </div>
          <Button type="submit" className="rounded-full sm:mt-[1.375rem]" disabled={isSubmitting}>
            {isSubmitting ? 'Sending...' : 'Send invite'}
          </Button>
          <p className="text-sm text-muted-foreground sm:col-span-3">{ROLE_DESCRIPTIONS[selectedRole]}</p>
        </form>
      </CardContent>
    </Card>
  )
}
