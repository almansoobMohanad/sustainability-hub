import { createFileRoute, redirect } from '@tanstack/react-router'
import { can } from '@hub/shared/permissions'
import { EsgReadyPage } from '@/features/esg-ready/esg-ready-page'

/*
  "/reports/esg-ready?year=2025": the ESG Ready self-assessment of a year
  (default: this year). Admins and Managers only, like SEDG: Members are sent
  to the dashboard (the API refuses them too). Keyed by year, so switching
  years starts fresh (the autosave sends the old year's last changes first).
*/
type EsgReadySearch = { year?: number }

export const Route = createFileRoute('/_app/reports/esg-ready')({
  validateSearch: (search: Record<string, unknown>): EsgReadySearch => {
    const year = Number(search.year)
    return { year: Number.isInteger(year) && year >= 1990 && year <= new Date().getFullYear() ? year : undefined }
  },
  beforeLoad: ({ context: { me } }) => {
    // The _app guard already loaded the person and their active company
    const role = me?.companies.find((company) => company.id === me.activeCompanyId)?.role
    if (!can(role, 'reports', 'update')) throw redirect({ to: '/' })
  },
  head: () => ({ meta: [{ title: 'ESG Ready · Sustainability Hub' }] }),
  component: EsgReadyRoute,
})

function EsgReadyRoute() {
  const year = Route.useSearch().year ?? new Date().getFullYear()
  return <EsgReadyPage key={year} year={year} />
}
