import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useMatchRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { Check, ChevronsUpDown, Globe, Leaf, LogOut, MailOpen, Plus } from 'lucide-react'
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@hub/ui/components/sidebar'
import { ROLE_LABELS, can, isRole } from '@hub/shared/permissions'
import { forgetSession } from '@/features/auth/session'
import { forgetCompanyData, useMe } from '@/features/company/me'
import { myInvitationsQueryOptions } from '@/features/company/my-invitations'
import { statusCountsQueryOptions } from '@/features/emissions/queries'
import { authClient } from '@/lib/auth-client'
import { appNav } from '@/lib/nav'
import { SITE_URL } from '@/lib/site-links'
import { SidebarResizeHandle } from './sidebar-resize-handle'

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
  const router = useRouter()
  const queryClient = useQueryClient()
  // Loaded by the _app guard: the signed-in person, their companies, the active one
  const { user, companies, company, role } = useMe()
  // Managers and Admins: how many entries (all years) wait for verification, next to "Entries"
  const canVerify = can(role, 'emissions', 'verify')
  const { data: counts } = useQuery({
    ...statusCountsQueryOptions(company?.id ?? '', { year: null, scope: null }),
    enabled: Boolean(company) && canVerify,
  })
  const waiting = canVerify ? (counts?.pending ?? 0) : 0
  // Invitations to other companies waiting for this person (dot + menu section)
  const { data: invitations = [] } = useQuery(myInvitationsQueryOptions)
  const invitationSummary =
    invitations.length === 1 ? '1 pending invitation' : `${invitations.length} pending invitations`
  const [signingOut, setSigningOut] = useState(false)

  async function switchCompany(companyId: string) {
    if (companyId === company?.id) return
    await authClient.organization.setActive({ organizationId: companyId })
    // Nothing from the previous company may stay on screen
    forgetCompanyData(queryClient)
    await navigate({ to: '/' })
    await router.invalidate()
  }

  async function signOut() {
    setSigningOut(true)
    try {
      await authClient.signOut()
    } finally {
      // Order matters: forget only "who is signed in" (so /sign-in doesn't send
      // us straight back), leave the signed-in pages, THEN forget everything
      // else cached for this person, so nothing of theirs is shown to whoever
      // signs in next in this browser. Clearing first would make the pages
      // still on screen re-ask "who am I?" and fail.
      forgetSession(queryClient)
      await navigate({ to: '/sign-in', search: { notice: 'signed-out' } })
      queryClient.clear()
    }
  }

  return (
    // collapsible="icon": collapses to a narrow strip of icons instead of disappearing
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Company switcher: the active company, your role in it, your other
                companies, and invitations waiting for you */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip={invitations.length > 0 ? `${company?.name ?? 'Company'} · ${invitationSummary}` : (company?.name ?? 'Company')}
                >
                  <span className="relative flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                    <Leaf className="size-4" aria-hidden />
                    {/* Inside the logo's corner, so it also shows when the sidebar is
                        collapsed to icons (the collapsed button clips anything outside it).
                        Amber, not green: it must stand out against the green logo. */}
                    {invitations.length > 0 ? (
                      <span
                        className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-amber-400 ring-2 ring-emerald-600"
                        aria-hidden
                      />
                    ) : null}
                  </span>
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate font-semibold">{company?.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {company ? ROLE_LABELS[company.role] : null}
                    </span>
                  </span>
                  {invitations.length > 0 ? <span className="sr-only">, {invitationSummary}</span> : null}
                  <ChevronsUpDown className="ml-auto size-4" aria-hidden />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-60">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Your companies</DropdownMenuLabel>
                {companies.map((option) => (
                  <DropdownMenuItem key={option.id} onSelect={() => switchCompany(option.id)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{option.name}</span>
                      <span className="block text-xs text-muted-foreground">{ROLE_LABELS[option.role]}</span>
                    </span>
                    {option.id === company?.id ? <Check className="size-4" aria-label="Current company" /> : null}
                  </DropdownMenuItem>
                ))}
                {invitations.length > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                      <span className="size-2 rounded-full bg-amber-400" aria-hidden />
                      Invitations ({invitations.length})
                    </DropdownMenuLabel>
                    {invitations.map((invitation) => (
                      <DropdownMenuItem key={invitation.id} asChild>
                        {/* The invitation page shows the details with Join / Decline */}
                        <Link to="/invitations/$invitationId" params={{ invitationId: invitation.id }}>
                          <MailOpen aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{invitation.organizationName}</span>
                            <span className="block text-xs text-muted-foreground">
                              as {isRole(invitation.role) ? ROLE_LABELS[invitation.role] : invitation.role}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">View</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/create-company">
                    <Plus aria-hidden />
                    Create a company
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                        {item.badge === 'pending-entries' && waiting > 0 ? (
                          <span className="sr-only">
                            {waiting === 1 ? '(1 entry waiting for verification)' : `(${waiting} entries waiting for verification)`}
                          </span>
                        ) : null}
                      </Link>
                    </SidebarMenuButton>
                    {item.badge === 'pending-entries' && waiting > 0 ? (
                      <SidebarMenuBadge
                        aria-hidden
                        className="rounded-full bg-amber-100 px-1.5 text-amber-900 peer-hover/menu-button:text-amber-900 peer-data-active/menu-button:text-amber-900 dark:bg-amber-900/60 dark:text-amber-100"
                      >
                        {waiting > 99 ? '99+' : waiting}
                      </SidebarMenuBadge>
                    ) : null}
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
                <SidebarMenuButton size="lg" tooltip={user.name}>
                  <Avatar className="size-8 rounded-lg">
                    {/* Google profile photo when signed up with Google; initials otherwise
                        (and while it loads). no-referrer: Google's image servers can
                        refuse requests that carry our page address. */}
                    {user.image ? (
                      <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" className="rounded-lg" />
                    ) : null}
                    <AvatarFallback className="rounded-lg bg-emerald-50 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4" aria-hidden />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
                <DropdownMenuLabel className="font-normal">
                  <span className="block truncate font-medium">{user.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {/* The public website (apps/site), when there is one; address set in lib/site-links.ts */}
                {SITE_URL && (
                  <DropdownMenuItem asChild>
                    <a href={SITE_URL}>
                      <Globe aria-hidden />
                      Back to website
                    </a>
                  </DropdownMenuItem>
                )}
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
