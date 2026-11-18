import type { LinkProps } from '@tanstack/react-router'
import { Building2, CirclePlus, LayoutDashboard, ListChecks, Rows3, Users, type LucideIcon } from 'lucide-react'

/*
  The app's navigation: the pages shown in the sidebar, grouped.
  Add a page here once its route exists in src/routes/_app/.
  `to` is type-checked against the real routes.
*/

export type AppNavItem = {
  label: string
  to: NonNullable<LinkProps['to']>
  icon: LucideIcon
}

export type AppNavGroup = {
  label: string
  items: AppNavItem[]
}

export const appNav: AppNavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard }],
  },
  {
    label: 'Emissions',
    items: [
      { label: 'Add emissions', to: '/emissions/new', icon: CirclePlus },
      { label: 'Entries', to: '/emissions', icon: Rows3 },
    ],
  },
  {
    label: 'Company',
    items: [
      { label: 'Emission sources', to: '/settings/sources', icon: ListChecks },
      { label: 'Members', to: '/settings/members', icon: Users },
      { label: 'Company settings', to: '/settings/company', icon: Building2 },
    ],
  },
]
