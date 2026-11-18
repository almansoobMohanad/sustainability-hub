import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { MailOpen, TriangleAlert } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import { ROLE_DESCRIPTIONS, ROLE_LABELS, isRole } from '@hub/shared/permissions'
import { authClient } from '@/lib/auth-client'
import { NETWORK_ERROR_MESSAGE } from '@/features/auth/auth-errors'
import { AuthHeading, FormMessage } from '@/features/auth/auth-parts'
import { sessionQueryOptions } from '@/features/auth/session'
import { companyErrorMessage } from './company-errors'
import { forgetCompanyData } from './me'
import { myInvitationsQueryOptions } from './my-invitations'

/*
  Opened from an invitation email (/invitations/<id>).
  - signed out: explain, and offer sign-in / sign-up that come back here
  - signed in: show the company and role, Accept or Decline. The API only
    shows and accepts an invitation for the exact (verified) email it was sent
    to, so a forwarded link is useless to anyone else.
*/
export function InvitationPage({ invitationId }: { invitationId: string }) {
  const { data: session, isPending: sessionPending } = useQuery(sessionQueryOptions)
  const here = `/invitations/${invitationId}`

  if (sessionPending) return <p className="text-sm text-muted-foreground">Loading invitation...</p>

  if (!session) {
    return (
      <>
        <Icon />
        <AuthHeading
          title="You've been invited"
          description="Sign in, or create an account, with the email address the invitation was sent to. You'll come back here to accept it."
        />
        <div className="space-y-3">
          <Button asChild className="h-10 w-full rounded-full">
            <Link to="/sign-in" search={{ redirect: here }}>
              Sign in
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-10 w-full rounded-full">
            <Link to="/sign-up" search={{ redirect: here }}>
              Create an account
            </Link>
          </Button>
        </div>
      </>
    )
  }

  return <SignedInInvitation invitationId={invitationId} signedInAs={session.user.email} />
}

function Icon({ warning = false }: { warning?: boolean }) {
  const Glyph = warning ? TriangleAlert : MailOpen
  return (
    <span
      className={
        warning
          ? 'mb-5 flex size-11 items-center justify-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
          : 'mb-5 flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
      }
    >
      <Glyph className="size-5" aria-hidden />
    </span>
  )
}

function SignedInInvitation({ invitationId, signedInAs }: { invitationId: string; signedInAs: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [declined, setDeclined] = useState(false)

  const invitation = useQuery({
    queryKey: ['invitation', invitationId],
    queryFn: async () => {
      const { data, error } = await authClient.organization.getInvitation({ query: { id: invitationId } })
      if (error) return { ok: false as const, code: error.code, message: companyErrorMessage(error) }
      return { ok: true as const, invitation: data }
    },
    retry: false,
  })

  async function accept() {
    setBusy('accept')
    setActionError(null)
    try {
      const { error } = await authClient.organization.acceptInvitation({ invitationId })
      if (error) {
        setActionError(companyErrorMessage(error))
        setBusy(null)
        return
      }
      // Accepting makes the company active; start fresh in it
      forgetCompanyData(queryClient)
      await navigate({ to: '/' })
    } catch {
      setActionError(NETWORK_ERROR_MESSAGE)
      setBusy(null)
    }
  }

  async function decline() {
    setBusy('decline')
    setActionError(null)
    try {
      const { error } = await authClient.organization.rejectInvitation({ invitationId })
      if (error) setActionError(companyErrorMessage(error))
      else {
        setDeclined(true)
        // So the company switcher stops listing it
        await queryClient.invalidateQueries({ queryKey: myInvitationsQueryOptions.queryKey })
      }
    } catch {
      setActionError(NETWORK_ERROR_MESSAGE)
    } finally {
      setBusy(null)
    }
  }

  if (invitation.isPending) return <p className="text-sm text-muted-foreground">Loading invitation...</p>

  if (declined) {
    return (
      <>
        <Icon />
        <AuthHeading title="Invitation declined" description="You won't be added to this company." />
        <Button asChild variant="outline" className="h-10 w-full rounded-full">
          <Link to="/">Continue</Link>
        </Button>
      </>
    )
  }

  if (!invitation.data?.ok) {
    const wrongPerson = invitation.data?.code === 'YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION'
    return (
      <>
        <Icon warning />
        <AuthHeading
          title={wrongPerson ? 'This invitation is for someone else' : "This invitation isn't valid"}
          description={
            wrongPerson ? (
              <>
                It was sent to a different email address. You&apos;re signed in as{' '}
                <span className="font-medium text-foreground">{signedInAs}</span>. Sign out and sign in with the
                invited address to accept it.
              </>
            ) : (
              invitation.data?.message ?? 'It may have expired, been cancelled or already been used.'
            )
          }
        />
        <Button asChild variant="outline" className="h-10 w-full rounded-full">
          <Link to="/">Continue</Link>
        </Button>
      </>
    )
  }

  const { organizationName, inviterEmail, role } = invitation.data.invitation
  const roleLabel = isRole(role) ? ROLE_LABELS[role] : role

  return (
    <>
      <Icon />
      <AuthHeading
        title={`Join ${organizationName}`}
        description={
          <>
            <span className="font-medium text-foreground">{inviterEmail}</span> invited you to join as a{' '}
            <span className="font-medium text-foreground">{roleLabel}</span>.
          </>
        }
      />
      {isRole(role) ? <p className="mb-5 text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p> : null}
      {actionError ? <FormMessage tone="error">{actionError}</FormMessage> : null}
      <div className="space-y-3">
        <Button className="h-10 w-full rounded-full" onClick={accept} disabled={busy !== null}>
          {busy === 'accept' ? 'Joining...' : `Join ${organizationName}`}
        </Button>
        <Button variant="outline" className="h-10 w-full rounded-full" onClick={decline} disabled={busy !== null}>
          {busy === 'decline' ? 'Declining...' : 'Decline'}
        </Button>
      </div>
    </>
  )
}
