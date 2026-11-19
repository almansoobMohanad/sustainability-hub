import { createFileRoute } from '@tanstack/react-router'
import { AddEmissionPage } from '@/features/emissions/add-emission-page'

// "/emissions/new" -> add an emissions entry (the page loads the company's sources itself)
export const Route = createFileRoute('/_app/emissions/new')({
  head: () => ({ meta: [{ title: 'Add emissions · Sustainability Hub' }] }),
  component: AddEmissionPage,
})
