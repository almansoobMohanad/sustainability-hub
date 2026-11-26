import type { LinkProps } from '@tanstack/react-router'
import {
  Building2,
  CirclePlus,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  ListChecks,
  Rows3,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Resource } from '@hub/shared/permissions'

/*
  The app's navigation: the pages shown in the sidebar, grouped.
  Add a page here once its route exists in src/routes/_app/.
  `to` is type-checked against the real routes.
*/

export type AppNavItem = {
  label: string
  to: NonNullable<LinkProps['to']>
  icon: LucideIcon
  /** A live count next to the label (only shown when above 0) */
  badge?: 'pending-entries'
  /** Only shown to roles with this permission (e.g. Members don't see reports at all) */
  permission?: { resource: Resource; action: string }
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
      { label: 'Entries', to: '/emissions', icon: Rows3, badge: 'pending-entries' },
    ],
  },
  {
    label: 'Reports',
    items: [
      {
        label: 'SEDG disclosure',
        to: '/reports/sedg',
        icon: FileText,
        permission: { resource: 'reports', action: 'update' },
      },
      {
        label: 'ESG Ready',
        to: '/reports/esg-ready',
        icon: ClipboardCheck,
        permission: { resource: 'reports', action: 'update' },
      },
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
