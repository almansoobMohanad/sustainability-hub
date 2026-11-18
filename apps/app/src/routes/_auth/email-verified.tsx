import { createFileRoute } from '@tanstack/react-router'
import { EmailVerifiedPage } from '@/features/auth/email-verified-page'
import { optionalString } from '@/features/auth/redirect'

// The verification link (handled by the API) redirects here, with ?error=... if
// it failed and ?redirect=... when the person was heading somewhere (an invitation)
export const Route = createFileRoute('/_auth/email-verified')({
  validateSearch: (search: Record<string, unknown>): { error?: string; redirect?: string } => ({
    error: optionalString(search.error),
    redirect: optionalString(search.redirect),
  }),
  head: () => ({ meta: [{ title: 'Email verification · Sustainability Hub' }] }),
  component: EmailVerifiedRoute,
})

function EmailVerifiedRoute() {
  const { error, redirect } = Route.useSearch()
  return <EmailVerifiedPage error={error} redirectTo={redirect} />
}
