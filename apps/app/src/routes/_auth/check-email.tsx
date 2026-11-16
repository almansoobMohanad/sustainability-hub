import { createFileRoute } from '@tanstack/react-router'
import { CheckEmailPage } from '@/features/auth/check-email-page'
import { optionalString } from '@/features/auth/redirect'

type Search = { email?: string; reason?: 'unverified' }

export const Route = createFileRoute('/_auth/check-email')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    email: optionalString(search.email),
    reason: search.reason === 'unverified' ? 'unverified' : undefined,
  }),
  head: () => ({ meta: [{ title: 'Check your inbox · Sustainability Hub' }] }),
  component: CheckEmailRoute,
})

function CheckEmailRoute() {
  const { email, reason } = Route.useSearch()
  return <CheckEmailPage email={email} reason={reason} />
}
