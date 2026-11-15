import { Link } from '@tanstack/react-router'
import { Leaf, Menu } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@hub/ui/components/sheet'
import { siteNav } from './site-nav'

/*
  Navigation links use the router's <Link>, which switches pages instantly
  (no full page reload) and marks the current page itself: it adds
  data-status="active" and aria-current="page" to the link, which the classes
  below use for the highlight. "Home" only counts as active on exactly "/".
*/
const navLinkClass =
  'text-muted-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/*
        Three columns: [logo | nav | right side].
        The outer columns are both "1fr" (equal width), so the middle column
        (the nav) always sits in the exact centre of the header, no matter how
        wide the logo is.
      */}
      <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center px-page">
        {/* Left: project name */}
        <Link
          to="/"
          className="flex items-center gap-2 justify-self-start font-semibold tracking-tight"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Leaf className="size-4" aria-hidden />
          </span>
          Sustainability Hub
        </Link>

        {/* Centre: page links (hidden on small screens, see menu below) */}
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {siteNav.map((item) => (
            <Button key={item.to} variant="ghost" asChild className={navLinkClass}>
              <Link to={item.to} activeOptions={{ exact: item.to === '/' }}>
                {item.label}
              </Link>
            </Button>
          ))}
        </nav>

        {/*
          Right: "Get started" button (hidden on the smallest screens, where it
          lives in the menu instead) and the mobile menu button.
          col-start-3 keeps it in the right column even when the nav is hidden.
        */}
        <div className="col-start-3 flex items-center gap-2 justify-self-end">
          {/* /signup doesn't exist yet (comes with auth), so this is a plain link for now */}
          <Button className="hidden rounded-full px-4 sm:inline-flex" asChild>
            <a href="/signup">Get started</a>
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Sustainability Hub</SheetTitle>
                <SheetDescription className="sr-only">Site navigation</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
                {siteNav.map((item) => (
                  <SheetClose key={item.to} asChild>
                    <Button variant="ghost" asChild className={`justify-start ${navLinkClass}`}>
                      <Link to={item.to} activeOptions={{ exact: item.to === '/' }}>
                        {item.label}
                      </Link>
                    </Button>
                  </SheetClose>
                ))}
              </nav>
              <div className="mt-auto p-4">
                <SheetClose asChild>
                  <Button className="h-11 w-full rounded-full text-base" asChild>
                    <a href="/signup">Get started</a>
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
