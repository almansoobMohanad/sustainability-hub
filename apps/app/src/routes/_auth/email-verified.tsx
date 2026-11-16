import { createFileRoute } from '@tanstack/react-router'
import { EmailVerifiedPage } from '@/features/auth/email-verified-page'
import { optionalString } from '@/features/auth/redirect'

// The verification link (handled by the API) redirects here, with ?error=... if it failed
export const Route = createFileRoute('/_auth/email-verified')({
  validateSearch: (search: Record<string, unknown>): { error?: string } => ({
    error: optionalString(search.error),
  }),
  head: () => ({ meta: [{ title: 'Email verification · Sustainability Hub' }] }),
  component: EmailVerifiedRoute,
})

function EmailVerifiedRoute() {
  const { error } = Route.useSearch()
  return <EmailVerifiedPage error={error} />
}
