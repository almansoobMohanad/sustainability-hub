import { createFileRoute } from '@tanstack/react-router'
import { optionalString } from '@/features/auth/redirect'
import { redirectIfSignedIn } from '@/features/auth/session'
import { SignInPage, type SignInNotice } from '@/features/auth/sign-in-page'

type Search = { redirect?: string; notice?: SignInNotice }

export const Route = createFileRoute('/_auth/sign-in')({
  // ?redirect=/emissions/new : where to go after signing in (checked before use)
  // ?notice=password-reset   : show a confirmation message
  validateSearch: (search: Record<string, unknown>): Search => ({
    redirect: optionalString(search.redirect),
    notice: search.notice === 'password-reset' || search.notice === 'signed-out' ? search.notice : undefined,
  }),
  beforeLoad: ({ context }) => redirectIfSignedIn(context.queryClient),
  head: () => ({ meta: [{ title: 'Sign in · Sustainability Hub' }] }),
  component: SignInRoute,
})

function SignInRoute() {
  const { redirect, notice } = Route.useSearch()
  return <SignInPage redirectTo={redirect} notice={notice} />
}
