import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { routeTree } from './routeTree.gen'
import './index.css'

// Zod speeds up validation by generating code with `new Function`, which the
// server's Content-Security-Policy forbids (no eval). Use the plain version.
z.config({ jitless: true })

// After a new version is deployed, a page that's still open asks for code files
// of the OLD version, which no longer exist. Load the new version instead (at
// most once every 10 seconds, so a real outage can't cause a reload loop).
window.addEventListener('vite:preloadError', (event) => {
  const RELOADED_AT = 'hub.reloadedForNewVersion'
  let last = 0
  try {
    last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0)
    sessionStorage.setItem(RELOADED_AT, String(Date.now()))
  } catch {
    // storage blocked: still reload (the time check is only a safety net)
  }
  if (Date.now() - last < 10_000) return // let the router show its error screen
  event.preventDefault()
  window.location.reload()
})

// Server-state cache (TanStack Query): fetching, caching and refreshing data
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data counts as fresh for 30s: switching pages doesn't refetch immediately
      staleTime: 30_000,
    },
  },
})

const router = createRouter({
  // Generated from the files in src/routes/ by the router's Vite plugin
  routeTree,
  // Lets routes prefetch their data through the same query cache
  context: { queryClient },
  // Start loading a page (code + data) when the user hovers/focuses its link
  defaultPreload: 'intent',
  // Let TanStack Query decide freshness instead of the router's own cache
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

// Makes every <Link to="..."> type-checked against the real routes
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
