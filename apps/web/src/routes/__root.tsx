import { HeadContent, Outlet, createRootRoute } from '@tanstack/react-router'
import { FileQuestion } from 'lucide-react'
import { PlaceholderPage } from '@/components/PlaceholderPage'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'

/*
  The root route: the layout shared by every page (header, page content, footer).
  Each file in this folder adds a page, rendered where <Outlet /> is:
    index.tsx -> /      docs.tsx -> /docs      blog.tsx -> /blog      about.tsx -> /about
*/
export const Route = createRootRoute({
  head: () => ({ meta: [{ title: 'Sustainability Hub' }] }),
  component: RootLayout,
  notFoundComponent: () => (
    <PlaceholderPage
      title="Page not found"
      message="This page doesn't exist (yet)."
      icon={FileQuestion}
    />
  ),
})

function RootLayout() {
  return (
    <>
      {/* Puts each page's <title> into the document head */}
      <HeadContent />
      <div className="flex min-h-svh flex-col bg-background text-foreground">
        <SiteHeader />
        {/* flex-1 + flex-col: pages can fill the space between header and footer */}
        <main className="flex flex-1 flex-col">
          <Outlet />
        </main>
        <SiteFooter />
      </div>
    </>
  )
}
