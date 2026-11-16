import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { z } from 'zod'
import { Button } from '@hub/ui/components/button'
import { Input } from '@hub/ui/components/input'
import { Label } from '@hub/ui/components/label'
import { authClient } from '@/lib/auth-client'
import { NETWORK_ERROR_MESSAGE, authErrorMessage } from './auth-errors'
import { AuthHeading, DevInboxHint, FieldError, FormMessage } from './auth-parts'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').pipe(z.email('Enter a valid email address')),
})
type Values = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  async function onSubmit({ email }: Values) {
    setFormError(null)
    try {
      // redirectTo: the page the emailed link opens (with ?token=...)
      const { error } = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })
      if (error) setFormError(authErrorMessage(error))
      else setSentTo(email)
    } catch {
      setFormError(NETWORK_ERROR_MESSAGE)
    }
  }

  if (sentTo) {
    // Worded so it doesn't reveal whether an account exists for this email
    return (
      <>
        <AuthHeading
          title="Check your inbox"
          description={
            <>
              If an account exists for <span className="font-medium text-foreground">{sentTo}</span>, we sent a link
              to reset its password. The link expires in 1 hour.
            </>
          }
        />
        <DevInboxHint />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/sign-in" className="font-medium text-foreground underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </>
    )
  }

  return (
    <>
      <AuthHeading
        title="Forgot your password?"
        description="Enter the email you signed up with and we'll send you a link to choose a new password."
      />

      {formError ? <FormMessage tone="error">{formError}</FormMessage> : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
          <FieldError id="email-error" message={errors.email?.message} />
        </div>
        <Button type="submit" className="h-10 w-full rounded-full" disabled={isSubmitting}>
          {isSubmitting ? 'Sending...' : 'Send reset link'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link to="/sign-in" className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  )
}
