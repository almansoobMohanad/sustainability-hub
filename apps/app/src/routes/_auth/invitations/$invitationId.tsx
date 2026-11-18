import { createFileRoute } from '@tanstack/react-router'
import { InvitationPage } from '@/features/company/invitation-page'

// Opened from an invitation email. Works signed in or out (the page explains).
export const Route = createFileRoute('/_auth/invitations/$invitationId')({
  head: () => ({ meta: [{ title: 'Invitation · Sustainability Hub' }] }),
  component: InvitationRoute,
})

function InvitationRoute() {
  const { invitationId } = Route.useParams()
  return <InvitationPage invitationId={invitationId} />
}
