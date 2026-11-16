import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Alert, AlertDescription } from '@hub/ui/components/alert'

/* Small building blocks shared by the sign-in, sign-up and password pages. */

export function AuthHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-6 space-y-1.5">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  )
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  )
}

/** Message above a form. role="alert" makes screen readers announce it. */
export function FormMessage({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  const Icon = tone === 'error' ? CircleAlert : CircleCheck
  return (
    <Alert
      variant={tone === 'error' ? 'destructive' : 'default'}
      className={
        tone === 'success'
          ? 'mb-5 border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
          : 'mb-5'
      }
    >
      <Icon aria-hidden />
      <AlertDescription className={tone === 'success' ? 'text-current' : undefined}>{children}</AlertDescription>
    </Alert>
  )
}

/** Development only: where the test emails go (Mailpit from docker-compose.yml). */
export function DevInboxHint() {
  if (!import.meta.env.DEV) return null
  return (
    <p className="mt-4 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
      Development: emails are caught by Mailpit at{' '}
      <a href="http://localhost:8025" target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">
        localhost:8025
      </a>
      .
    </p>
  )
}
