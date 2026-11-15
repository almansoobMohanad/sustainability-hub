import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import './index.css'

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
