import { createFileRoute } from '@tanstack/react-router'
import { EmissionSourcesPage } from '@/features/factors/emission-sources-page'

export const Route = createFileRoute('/_app/settings/sources')({
  head: () => ({ meta: [{ title: 'Emission sources · Sustainability Hub' }] }),
  component: EmissionSourcesPage,
})
