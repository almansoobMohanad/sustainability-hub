import type { QueryClient } from '@tanstack/react-query'
import { HeadContent, Link, Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { Button } from '@hub/ui/components/button'
import { TooltipProvider } from '@hub/ui/components/tooltip'

/*
  Root route of the product app. Pages live in src/routes/_app/, which wraps
  them in the sidebar layout (_app.tsx). Pages outside _app/ (e.g. a future
  /login) get no sidebar.
*/
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({ meta: [{ title: 'Sustainability Hub' }] }),
  component: RootComponent,
  notFoundComponent: NotFound,
})

function RootComponent() {
  return (
    <>
      <HeadContent />
      {/* Needed for tooltips, e.g. page names when the sidebar is collapsed to icons */}
      <TooltipProvider delayDuration={300}>
        <Outlet />
      </TooltipProvider>
    </>
  )
}

function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">This page doesn&apos;t exist (yet).</p>
      <Button asChild variant="outline" className="mt-4 rounded-full px-5">
        <Link to="/">Go to dashboard</Link>
      </Button>
    </main>
  )
}
