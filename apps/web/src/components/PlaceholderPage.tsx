import { Link } from '@tanstack/react-router'
import { Construction, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

type PlaceholderPageProps = {
  title: string
  message?: string
  icon?: LucideIcon
}

/**
 * Simple centred page for sections that don't exist yet
 * (Docs, Blog, About) and for "page not found".
 */
export function PlaceholderPage({
  title,
  message = 'Work in progress',
  icon: Icon = Construction,
}: PlaceholderPageProps) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-page py-24 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
        <Icon className="size-6" aria-hidden />
      </span>
      <h1 className="mt-6 font-heading text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-10 h-11 rounded-full px-6 text-base" asChild>
        <Link to="/">Back to home</Link>
      </Button>
    </section>
  )
}
