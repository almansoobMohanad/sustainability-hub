import { Leaf, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { isActivePath, siteNav } from './site-nav'

export function SiteHeader() {
  // Temporary: read the URL directly. The router will provide this later.
  const pathname = window.location.pathname

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
        <a
          href="/"
          className="flex items-center gap-2 justify-self-start font-semibold tracking-tight"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Leaf className="size-4" aria-hidden />
          </span>
          Sustainability Hub
        </a>

        {/* Centre: page links (hidden on small screens, see menu below) */}
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {siteNav.map((item) => {
            const active = isActivePath(item.href, pathname)
            return (
              <Button
                key={item.href}
                variant="ghost"
                asChild
                className={cn(!active && 'text-muted-foreground')}
              >
                <a
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(active && 'bg-muted')}
                >
                  {item.label}
                </a>
              </Button>
            )
          })}
        </nav>

        {/*
          Right: "Get started" button (hidden on the smallest screens, where it
          lives in the menu instead) and the mobile menu button.
          col-start-3 keeps it in the right column even when the nav is hidden.
        */}
        <div className="col-start-3 flex items-center gap-2 justify-self-end">
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
                {siteNav.map((item) => {
                  const active = isActivePath(item.href, pathname)
                  return (
                    <SheetClose key={item.href} asChild>
                      <Button
                        variant="ghost"
                        asChild
                        className={cn('justify-start', !active && 'text-muted-foreground')}
                      >
                        <a
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          className={cn(active && 'bg-muted')}
                        >
                          {item.label}
                        </a>
                      </Button>
                    </SheetClose>
                  )
                })}
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
