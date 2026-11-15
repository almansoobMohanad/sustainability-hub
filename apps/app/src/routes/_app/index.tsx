import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { entriesQuery, sourcesQuery } from '@/features/emissions/queries'

// "/" -> dashboard. The loader fetches the data before the page shows (and
// when hovering a link to it), so the page never renders half-loaded.
export const Route = createFileRoute('/_app/')({
  head: () => ({ meta: [{ title: 'Dashboard · Sustainability Hub' }] }),
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(entriesQuery),
      queryClient.ensureQueryData(sourcesQuery),
    ]),
  component: DashboardPage,
})
