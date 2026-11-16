import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import './index.css'

const router = createRouter({
  // Generated from the files in src/routes/ by the router's Vite plugin
  routeTree,
  // Start each new page at the top; restore the position when going back
  scrollRestoration: true,
  // Start loading a page's code when the user hovers/focuses its link
  defaultPreload: 'intent',
})

// Makes every <Link to="..."> type-checked against the real routes
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
