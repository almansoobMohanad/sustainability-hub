import type { QueryClient } from '@tanstack/react-query'
import {
  HeadContent,
  Link,
  Outlet,
  createRootRouteWithContext,
  useRouter,
  type ErrorComponentProps,
} from '@tanstack/react-router'
import { Button } from '@hub/ui/components/button'
import { TooltipProvider } from '@hub/ui/components/tooltip'

/*
  Root route of the product app.
  - src/routes/_app/: signed-in pages with the sidebar layout (_app.tsx)
  - src/routes/_auth/: sign-in, sign-up and password pages (_auth.tsx)
*/
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({ meta: [{ title: 'Sustainability Hub' }] }),
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: RootError,
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

/** Shown when a page can't load, e.g. the API is unreachable while checking the session. */
function RootError({ error }: ErrorComponentProps) {
  const router = useRouter()
  console.error(error)
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="max-w-md text-muted-foreground">
        We couldn&apos;t load this page. If you&apos;re offline or the server is restarting, try again in a moment.
      </p>
      <Button variant="outline" className="mt-4 rounded-full px-5" onClick={() => router.invalidate()}>
        Try again
      </Button>
    </main>
  )
}
