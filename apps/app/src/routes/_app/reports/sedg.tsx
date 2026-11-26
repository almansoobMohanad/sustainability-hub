import { createFileRoute, redirect } from '@tanstack/react-router'
import { can } from '@hub/shared/permissions'
import { SedgPage } from '@/features/sedg/sedg-page'

/*
  "/reports/sedg?year=2025": the SEDG disclosure of a year (default: this
  year). Admins and Managers only: Members are sent to the dashboard (the API
  refuses them too). The page is keyed by year, so switching years starts
  fresh (and the autosave sends the old year's last changes first).
*/
type SedgSearch = { year?: number }

export const Route = createFileRoute('/_app/reports/sedg')({
  validateSearch: (search: Record<string, unknown>): SedgSearch => {
    const year = Number(search.year)
    return { year: Number.isInteger(year) && year >= 1990 && year <= new Date().getFullYear() ? year : undefined }
  },
  beforeLoad: ({ context: { me } }) => {
    // The _app guard already loaded the person and their active company
    const role = me?.companies.find((company) => company.id === me.activeCompanyId)?.role
    if (!can(role, 'reports', 'update')) throw redirect({ to: '/' })
  },
  head: () => ({ meta: [{ title: 'SEDG disclosure · Sustainability Hub' }] }),
  component: SedgRoute,
})

function SedgRoute() {
  const year = Route.useSearch().year ?? new Date().getFullYear()
  return <SedgPage key={year} year={year} />
}
