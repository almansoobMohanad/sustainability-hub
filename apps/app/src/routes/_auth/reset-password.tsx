import { createFileRoute } from '@tanstack/react-router'
import { optionalString } from '@/features/auth/redirect'
import { ResetPasswordPage } from '@/features/auth/reset-password-page'

// The reset link (checked by the API) redirects here with ?token=... or ?error=INVALID_TOKEN
export const Route = createFileRoute('/_auth/reset-password')({
  validateSearch: (search: Record<string, unknown>): { token?: string; error?: string } => ({
    token: optionalString(search.token),
    error: optionalString(search.error),
  }),
  head: () => ({ meta: [{ title: 'Choose a new password · Sustainability Hub' }] }),
  component: ResetPasswordRoute,
})

function ResetPasswordRoute() {
  const { token, error } = Route.useSearch()
  return <ResetPasswordPage token={token} error={error} />
}
