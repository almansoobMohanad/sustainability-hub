import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { Button } from '@hub/ui/components/button'
import { Input } from '@hub/ui/components/input'
import { Label } from '@hub/ui/components/label'
import { authClient } from '@/lib/auth-client'
import { NETWORK_ERROR_MESSAGE, PASSWORD_HINT, authErrorMessage, isPasswordError } from './auth-errors'
import { AuthHeading, FieldError, FormMessage } from './auth-parts'
import { PasswordInput } from './password-input'

// Same rules as the API (it checks again; this just gives instant feedback)
const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100, 'Use at most 100 characters'),
  email: z.string().trim().min(1, 'Enter your email address').pipe(z.email('Enter a valid email address')),
  password: z.string().min(12, 'Use at least 12 characters').max(128, 'Use at most 128 characters'),
})
type Values = z.infer<typeof schema>

export function SignUpPage() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', password: '' } })

  async function onSubmit(values: Values) {
    setFormError(null)
    try {
      const { error } = await authClient.signUp.email({ ...values, callbackURL: '/email-verified' })
      if (error) {
        if (isPasswordError(error)) setError('password', { message: authErrorMessage(error) }, { shouldFocus: true })
        else setFormError(authErrorMessage(error))
        return
      }
      // Same next step whether or not the email was already registered (the API
      // answers identically on purpose; the real owner gets an email instead).
      await navigate({ to: '/check-email', search: { email: values.email } })
    } catch {
      setFormError(NETWORK_ERROR_MESSAGE)
    }
  }

  return (
    <>
      <AuthHeading title="Create your account" description="Track, verify and report your company's emissions." />

      {formError ? <FormMessage tone="error">{formError}</FormMessage> : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'name-error' : undefined}
            {...register('name')}
          />
          <FieldError id="name-error" message={errors.name?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
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

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'password-error password-hint' : 'password-hint'}
            {...register('password')}
          />
          <FieldError id="password-error" message={errors.password?.message} />
          <p id="password-hint" className="text-xs text-muted-foreground">
            {PASSWORD_HINT}
          </p>
        </div>

        <Button type="submit" className="h-10 w-full rounded-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/sign-in" className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  )
}
