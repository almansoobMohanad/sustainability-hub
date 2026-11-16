import { createFileRoute } from '@tanstack/react-router'
import { redirectIfSignedIn } from '@/features/auth/session'
import { SignUpPage } from '@/features/auth/sign-up-page'

export const Route = createFileRoute('/_auth/sign-up')({
  beforeLoad: ({ context }) => redirectIfSignedIn(context.queryClient),
  head: () => ({ meta: [{ title: 'Create an account · Sustainability Hub' }] }),
  component: SignUpPage,
})
