import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/components/PlaceholderPage'

// "/about" -> about the project (placeholder for now)
export const Route = createFileRoute('/about')({
  head: () => ({ meta: [{ title: 'About · Sustainability Hub' }] }),
  component: AboutPage,
})

function AboutPage() {
  return <PlaceholderPage title="About" />
}
