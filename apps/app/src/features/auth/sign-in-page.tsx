import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { Button } from '@hub/ui/components/button'
import { Input } from '@hub/ui/components/input'
import { Label } from '@hub/ui/components/label'
import { authClient } from '@/lib/auth-client'
import { NETWORK_ERROR_MESSAGE, authErrorMessage } from './auth-errors'
import { AuthHeading, FieldError, FormMessage } from './auth-parts'
import { PasswordInput } from './password-input'
import { safeRedirectPath } from './redirect'
import { forgetSession } from './session'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Enter your password'),
})
type Values = z.infer<typeof schema>

export type SignInNotice = 'password-reset' | 'signed-out'

const NOTICES: Record<SignInNotice, string> = {
  'password-reset': 'Your password was changed. Sign in with your new password.',
  'signed-out': 'You have signed out.',
}

export function SignInPage({ redirectTo, notice }: { redirectTo?: string; notice?: SignInNotice }) {
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })

  async function onSubmit(values: Values) {
    setFormError(null)
    try {
      // callbackURL: where the verification link goes if the email isn't verified yet
      // (signing in with an unverified email sends a fresh link)
      const { error } = await authClient.signIn.email({ ...values, callbackURL: '/email-verified' })
      if (error) {
        if (error.code === 'EMAIL_NOT_VERIFIED') {
          await navigate({ to: '/check-email', search: { email: values.email, reason: 'unverified' } })
          return
        }
        setFormError(authErrorMessage(error))
        return
      }
      forgetSession(queryClient)
      router.history.push(safeRedirectPath(redirectTo))
    } catch {
      setFormError(NETWORK_ERROR_MESSAGE)
    }
  }

  return (
    <>
      <AuthHeading title="Sign in" description="Welcome back. Sign in to your Sustainability Hub account." />

      {formError ? (
        <FormMessage tone="error">{formError}</FormMessage>
      ) : notice ? (
        <FormMessage tone="success">{NOTICES[notice]}</FormMessage>
      ) : null}

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

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
          <FieldError id="password-error" message={errors.password?.message} />
        </div>

        <Button type="submit" className="h-10 w-full rounded-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to Sustainability Hub?{' '}
        <Link to="/sign-up" className="font-medium text-foreground underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </>
  )
}
