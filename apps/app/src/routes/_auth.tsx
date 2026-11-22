import { Outlet, createFileRoute } from '@tanstack/react-router'
import { Leaf } from 'lucide-react'
import { SITE_URL } from '@/lib/site-links'

/*
  Layout for the signed-out pages (sign in, sign up, password reset, email
  verification): a simple centred column, no sidebar. "_auth" is a pathless
  layout route, so _auth/sign-in.tsx is just "/sign-in".
*/
export const Route = createFileRoute('/_auth')({
  component: AuthLayout,
})

const LOGO_CLASS = 'flex items-center gap-2 font-semibold tracking-tight'

function AuthLayout() {
  const logo = (
    <>
      <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
        <Leaf className="size-4" aria-hidden />
      </span>
      Sustainability Hub
    </>
  )
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-16 items-center px-page">
        {/* The logo links to the public website when there is one (lib/site-links.ts) */}
        {SITE_URL ? <a href={SITE_URL} className={LOGO_CLASS}>{logo}</a> : <span className={LOGO_CLASS}>{logo}</span>}
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
