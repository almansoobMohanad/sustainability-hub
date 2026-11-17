import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { authOptionsQueryOptions } from '@/features/auth/auth-options'
import { redirectIfSignedIn } from '@/features/auth/session'
import { SignUpPage } from '@/features/auth/sign-up-page'

export const Route = createFileRoute('/_auth/sign-up')({
  beforeLoad: ({ context }) => redirectIfSignedIn(context.queryClient),
  loader: ({ context }) => context.queryClient.ensureQueryData(authOptionsQueryOptions),
  head: () => ({ meta: [{ title: 'Create an account · Sustainability Hub' }] }),
  component: SignUpRoute,
})

function SignUpRoute() {
  const { data: options } = useSuspenseQuery(authOptionsQueryOptions)
  return <SignUpPage googleEnabled={options.google} />
}
