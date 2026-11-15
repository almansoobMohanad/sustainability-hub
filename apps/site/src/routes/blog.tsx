import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/components/PlaceholderPage'

// "/blog" -> blog (placeholder for now)
export const Route = createFileRoute('/blog')({
  head: () => ({ meta: [{ title: 'Blog · Sustainability Hub' }] }),
  component: BlogPage,
})

function BlogPage() {
  return <PlaceholderPage title="Blog" />
}
