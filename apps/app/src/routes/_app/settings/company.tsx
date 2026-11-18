import { createFileRoute } from '@tanstack/react-router'
import { CompanySettingsPage } from '@/features/company/company-settings-page'

export const Route = createFileRoute('/_app/settings/company')({
  head: () => ({ meta: [{ title: 'Company settings · Sustainability Hub' }] }),
  component: CompanySettingsPage,
})
