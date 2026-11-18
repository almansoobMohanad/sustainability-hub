import { createFileRoute, redirect } from '@tanstack/react-router'
import { sessionQueryOptions } from '@/features/auth/session'
import { CreateCompanyPage } from '@/features/company/create-company-page'

// Signed-in people without a company land here (see the _app guard); people
// with companies can come here to create another one.
export const Route = createFileRoute('/_auth/create-company')({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions)
    if (!session) throw redirect({ to: '/sign-in', search: { redirect: '/create-company' } })
  },
  head: () => ({ meta: [{ title: 'Set up your company · Sustainability Hub' }] }),
  component: CreateCompanyPage,
})
