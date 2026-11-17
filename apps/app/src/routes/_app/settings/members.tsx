import { createFileRoute } from '@tanstack/react-router'
import { MembersPage } from '@/features/company/members-page'

export const Route = createFileRoute('/_app/settings/members')({
  head: () => ({ meta: [{ title: 'Members · Sustainability Hub' }] }),
  component: MembersPage,
})
