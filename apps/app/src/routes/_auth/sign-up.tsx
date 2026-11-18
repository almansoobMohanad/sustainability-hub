import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { authOptionsQueryOptions } from '@/features/auth/auth-options'
import { optionalString } from '@/features/auth/redirect'
import { redirectIfSignedIn } from '@/features/auth/session'
import { SignUpPage } from '@/features/auth/sign-up-page'

export const Route = createFileRoute('/_auth/sign-up')({
  // ?redirect=/invitations/<id> : continue there once the account is ready
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: optionalString(search.redirect),
  }),
  beforeLoad: ({ context, search }) => redirectIfSignedIn(context.queryClient, search.redirect),
  loader: ({ context }) => context.queryClient.ensureQueryData(authOptionsQueryOptions),
  head: () => ({ meta: [{ title: 'Create an account · Sustainability Hub' }] }),
  component: SignUpRoute,
})

function SignUpRoute() {
  const { redirect } = Route.useSearch()
  const { data: options } = useSuspenseQuery(authOptionsQueryOptions)
  return <SignUpPage googleEnabled={options.google} redirectTo={redirect} />
}
