import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useMatchRoute, useNavigate } from '@tanstack/react-router'
import { ChevronsUpDown, Globe, Leaf, LogOut } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@hub/ui/components/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@hub/ui/components/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@hub/ui/components/sidebar'
import { sessionQueryOptions } from '@/features/auth/session'
import { authClient } from '@/lib/auth-client'
import { appNav } from '@/lib/nav'
import { SITE_URL } from '@/lib/site-links'
import { SidebarResizeHandle } from './sidebar-resize-handle'

/** Placeholder until companies exist (next step after sign-in). */
const DEMO_COMPANY = 'Demo Company Sdn Bhd'

/** "Aisyah Rahman" -> "AR" for the avatar. */
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() || '?'
}

type Props = {
  width: number
  onWidthChange: (width: number) => void
  onWidthCommit?: () => void
}

export function AppSidebar({ width, onWidthChange, onWidthCommit }: Props) {
  const matchRoute = useMatchRoute()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // Always present here: _app.tsx only renders this layout for signed-in people
  const { data: session } = useQuery(sessionQueryOptions)
  const user = session?.user
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    try {
      await authClient.signOut()
    } finally {
      // Forget everything cached for this person, so nothing of theirs is
      // shown to whoever signs in next in this browser.
      queryClient.clear()
      await navigate({ to: '/sign-in', search: { notice: 'signed-out' } })
    }
  }

  return (
    // collapsible="icon": collapses to a narrow strip of icons instead of disappearing
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Sustainability Hub">
              <Link to="/">
                <span className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                  <Leaf className="size-4" aria-hidden />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">Sustainability Hub</span>
                  <span className="truncate text-xs text-muted-foreground">{DEMO_COMPANY}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {appNav.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      // Shown as a tooltip when the sidebar is collapsed to icons
                      tooltip={item.label}
                      isActive={Boolean(matchRoute({ to: item.to }))}
                    >
                      <Link to={item.to}>
                        <item.icon aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={user?.name ?? 'Account'}>
                  <Avatar className="size-8 rounded-lg">
                    {/* Google profile photo when signed up with Google; initials otherwise
                        (and while it loads). no-referrer: Google's image servers can
                        refuse requests that carry our page address. */}
                    {user?.image ? (
                      <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" className="rounded-lg" />
                    ) : null}
                    <AvatarFallback className="rounded-lg bg-emerald-50 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {initials(user?.name ?? '')}
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate font-medium">{user?.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4" aria-hidden />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
                <DropdownMenuLabel className="font-normal">
                  <span className="block truncate font-medium">{user?.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  {/* The public website (apps/site); address set in lib/site-links.ts */}
                  <a href={SITE_URL}>
                    <Globe aria-hidden />
                    Back to website
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={signOut} disabled={signingOut}>
                  <LogOut aria-hidden />
                  {signingOut ? 'Signing out...' : 'Sign out'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarResizeHandle width={width} onWidthChange={onWidthChange} onCommit={onWidthCommit} />
    </Sidebar>
  )
}
