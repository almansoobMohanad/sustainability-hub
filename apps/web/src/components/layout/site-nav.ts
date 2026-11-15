// Single source of truth for the public site's navigation.
// The header and footer both read from this list, so adding/renaming a page
// happens here only. Plain hrefs for now; they become router links once
// TanStack Router is set up.

export type NavItem = {
  label: string
  href: string
}

export const siteNav: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Docs', href: '/docs' },
  { label: 'Blog', href: '/blog' },
  { label: 'About', href: '/about' },
]

/** True when `href` is the current page (or a sub-page of it, e.g. /docs/setup). */
export function isActivePath(href: string, pathname: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
