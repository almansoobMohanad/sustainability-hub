import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/components/PlaceholderPage'

// "/docs" -> documentation (placeholder for now)
export const Route = createFileRoute('/docs')({
  head: () => ({ meta: [{ title: 'Docs · Sustainability Hub' }] }),
  component: DocsPage,
})

function DocsPage() {
  return <PlaceholderPage title="Docs" />
}
