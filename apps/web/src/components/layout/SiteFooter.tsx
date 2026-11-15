import { siteNav } from './site-nav'

// "Home" is redundant in the footer (the logo already links there).
const footerNav = siteNav.filter((item) => item.href !== '/')

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <p>&copy; {year} Sustainability Hub</p>
        <nav aria-label="Footer" className="flex gap-6">
          {footerNav.map((item) => (
            <a key={item.href} href={item.href} className="transition-colors hover:text-foreground">
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}
