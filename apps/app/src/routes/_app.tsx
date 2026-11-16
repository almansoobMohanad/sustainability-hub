import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { SidebarInset, SidebarProvider } from '@hub/ui/components/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { SIDEBAR_DEFAULT_WIDTH, clampSidebarWidth } from '@/components/sidebar-width'

/*
  Layout for every app page: resizable sidebar on the left, page on the right.
  "_app" is a pathless layout route: it adds no URL segment, so its child
  _app/index.tsx is "/" and _app/emissions/new.tsx is "/emissions/new".
*/
export const Route = createFileRoute('/_app')({
  component: AppLayout,
})

const WIDTH_STORAGE_KEY = 'hub.sidebar.width'

/** Saved sidebar width (per browser), or the default. */
function readSavedWidth() {
  try {
    const saved = Number(localStorage.getItem(WIDTH_STORAGE_KEY))
    return saved ? clampSidebarWidth(saved) : SIDEBAR_DEFAULT_WIDTH
  } catch {
    return SIDEBAR_DEFAULT_WIDTH
  }
}

/** shadcn's sidebar saves open/collapsed in a "sidebar_state" cookie; read it back. */
function readSavedOpen() {
  return !document.cookie.split('; ').includes('sidebar_state=false')
}

function AppLayout() {
  const [width, setWidth] = useState(readSavedWidth)
  const [defaultOpen] = useState(readSavedOpen)

  // Remember the width shortly after resizing stops
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(WIDTH_STORAGE_KEY, String(width))
      } catch {
        // storage unavailable: the width just isn't remembered
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [width])

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={{ '--sidebar-width': `${width}px` } as CSSProperties}
    >
      <AppSidebar width={width} onWidthChange={setWidth} />
      <SidebarInset className="min-w-0">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
