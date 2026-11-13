import { Link } from '@tanstack/react-router'
import { siteNav } from './site-nav'

// "Home" is redundant in the footer (the logo already links there).
const footerNav = siteNav.filter((item) => item.to !== '/')

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t">
      {/* px-page: same side spacing as the header, so the footer lines up with the logo */}
      <div className="flex flex-col items-center justify-between gap-4 px-page py-8 text-sm text-muted-foreground sm:flex-row">
        <p>&copy; {year} Sustainability Hub</p>
        <nav aria-label="Footer" className="flex gap-6">
          {footerNav.map((item) => (
            <Link key={item.to} to={item.to} className="transition-colors hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
