import { Link, useMatchRoute } from '@tanstack/react-router'
import { ChevronsUpDown, Globe, Leaf, LogOut } from 'lucide-react'
import { Avatar, AvatarFallback } from '@hub/ui/components/avatar'
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
import { appNav } from '@/lib/nav'
import { SidebarResizeHandle } from './sidebar-resize-handle'

/** Placeholder until authentication exists. */
const DEMO_USER = { name: 'Demo user', role: 'Manager', company: 'Demo Company Sdn Bhd', initials: 'DU' }

type Props = {
  width: number
  onWidthChange: (width: number) => void
  onWidthCommit?: () => void
}

export function AppSidebar({ width, onWidthChange, onWidthCommit }: Props) {
  const matchRoute = useMatchRoute()

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
                  <span className="truncate text-xs text-muted-foreground">{DEMO_USER.company}</span>
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
                <SidebarMenuButton size="lg" tooltip={DEMO_USER.name}>
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-emerald-50 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {DEMO_USER.initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate font-medium">{DEMO_USER.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{DEMO_USER.role}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4" aria-hidden />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
                <DropdownMenuLabel className="font-normal">
                  <span className="block font-medium">{DEMO_USER.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    Accounts and sign-in are coming soon
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  {/* The public website (apps/site); its URL will come from config later */}
                  <a href="http://localhost:5173/">
                    <Globe aria-hidden />
                    Back to website
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <LogOut aria-hidden />
                  Sign out
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
