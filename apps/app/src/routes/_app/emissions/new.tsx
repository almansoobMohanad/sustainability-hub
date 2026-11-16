import { createFileRoute } from '@tanstack/react-router'
import { AddEmissionPage } from '@/features/emissions/add-emission-page'
import { sourcesQuery } from '@/features/emissions/queries'

// "/emissions/new" -> add an emissions entry
export const Route = createFileRoute('/_app/emissions/new')({
  head: () => ({ meta: [{ title: 'Add emissions · Sustainability Hub' }] }),
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(sourcesQuery),
  component: AddEmissionPage,
})
