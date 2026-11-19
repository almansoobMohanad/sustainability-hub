import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '@/features/dashboard/dashboard-page'

// "/" -> dashboard (it loads the year's summary itself)
export const Route = createFileRoute('/_app/')({
  head: () => ({ meta: [{ title: 'Dashboard · Sustainability Hub' }] }),
  component: DashboardPage,
})
