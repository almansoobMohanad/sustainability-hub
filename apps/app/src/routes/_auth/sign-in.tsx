import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { authOptionsQueryOptions } from '@/features/auth/auth-options'
import { optionalString } from '@/features/auth/redirect'
import { redirectIfSignedIn } from '@/features/auth/session'
import { SignInPage, type SignInNotice } from '@/features/auth/sign-in-page'

type Search = { redirect?: string; notice?: SignInNotice; error?: string }

export const Route = createFileRoute('/_auth/sign-in')({
  // ?redirect=/emissions/new : where to go after signing in (checked before use)
  // ?notice=password-reset   : show a confirmation message
  // ?error=access_denied     : a Google sign-in that was cancelled or failed
  validateSearch: (search: Record<string, unknown>): Search => ({
    redirect: optionalString(search.redirect),
    notice: search.notice === 'password-reset' || search.notice === 'signed-out' ? search.notice : undefined,
    error: optionalString(search.error),
  }),
  beforeLoad: ({ context }) => redirectIfSignedIn(context.queryClient),
  loader: ({ context }) => context.queryClient.ensureQueryData(authOptionsQueryOptions),
  head: () => ({ meta: [{ title: 'Sign in · Sustainability Hub' }] }),
  component: SignInRoute,
})

function SignInRoute() {
  const { redirect, notice, error } = Route.useSearch()
  const { data: options } = useSuspenseQuery(authOptionsQueryOptions)
  return <SignInPage redirectTo={redirect} notice={notice} googleError={error} googleEnabled={options.google} />
}
