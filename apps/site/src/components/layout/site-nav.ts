import type { LinkProps } from '@tanstack/react-router'

// Single source of truth for the public site's navigation.
// The header and footer both read from this list, so adding/renaming a page
// happens here only. `to` is type-checked against the real routes in
// src/routes/, so a link to a page that doesn't exist won't compile.

export type NavItem = {
  label: string
  to: NonNullable<LinkProps['to']>
}

export const siteNav: NavItem[] = [
  { label: 'Home', to: '/' },
  { label: 'Docs', to: '/docs' },
  { label: 'Blog', to: '/blog' },
  { label: 'About', to: '/about' },
]
