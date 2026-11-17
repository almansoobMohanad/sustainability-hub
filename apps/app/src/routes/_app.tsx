import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Outlet, createFileRoute, redirect, useLocation, useNavigate } from '@tanstack/react-router'
import { SidebarInset, SidebarProvider } from '@hub/ui/components/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { SIDEBAR_DEFAULT_WIDTH, clampSidebarWidth } from '@/components/sidebar-width'
import { forgetSession, sessionQueryOptions } from '@/features/auth/session'
import { meQueryOptions } from '@/features/company/me'
import { authClient } from '@/lib/auth-client'

/*
  Layout for every app page: resizable sidebar on the left, page on the right.
  "_app" is a pathless layout route: it adds no URL segment, so its child
  _app/index.tsx is "/" and _app/emissions/new.tsx is "/emissions/new".

  Every page in here requires sign-in AND a company. beforeLoad runs before any
  of them loads:
  - signed out            -> /sign-in, remembering where they were going
  - no company yet        -> /create-company (create one or accept an invitation)
  - no active company     -> switch to their first company
  (This guards the UI; the API checks the session and membership on its own.)
*/
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context: { queryClient }, location }) => {
    const signedOut = () => redirect({ to: '/sign-in', search: { redirect: location.href } })
    const session = await queryClient.ensureQueryData(sessionQueryOptions)
    if (!session) throw signedOut()

    let me = await queryClient.ensureQueryData(meQueryOptions)
    if (!me) {
      // The session ended on the server (signed out elsewhere, password reset)
      forgetSession(queryClient)
      throw signedOut()
    }
    if (me.companies.length === 0) throw redirect({ to: '/create-company' })
    if (!me.activeCompanyId) {
      await authClient.organization.setActive({ organizationId: me.companies[0]!.id })
      me = await queryClient.fetchQuery(meQueryOptions)
    }
    return { session, me }
  },
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
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()

  // If the session ends while a page is open (signed out in another tab, a
  // password reset elsewhere), "who am I?" comes back empty: go to sign-in
  // instead of letting the pages below fail.
  const { data: me } = useQuery(meQueryOptions)
  const signedOut = me === null
  useEffect(() => {
    if (!signedOut) return
    forgetSession(queryClient)
    void navigate({ to: '/sign-in', search: { redirect: location.href } })
  }, [signedOut, queryClient, navigate, location.href])

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

  if (signedOut) return null // about to go to /sign-in

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
