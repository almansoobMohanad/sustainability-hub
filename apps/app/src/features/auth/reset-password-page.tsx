import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { TriangleAlert } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@hub/ui/components/button'
import { Label } from '@hub/ui/components/label'
import { authClient } from '@/lib/auth-client'
import { NETWORK_ERROR_MESSAGE, PASSWORD_HINT, authErrorMessage, isPasswordError } from './auth-errors'
import { AuthHeading, FieldError, FormMessage } from './auth-parts'
import { PasswordInput } from './password-input'

const schema = z.object({
  password: z.string().min(12, 'Use at least 12 characters').max(128, 'Use at most 128 characters'),
})
type Values = z.infer<typeof schema>

/*
  Opened from the reset email. The API checked the link first and sent us here
  with ?token=... (valid) or ?error=INVALID_TOKEN (expired, used, or tampered).
*/
export function ResetPasswordPage({ token, error }: { token?: string; error?: string }) {
  const navigate = useNavigate()
  const [linkInvalid, setLinkInvalid] = useState(Boolean(error) || !token)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '' } })

  async function onSubmit({ password }: Values) {
    if (!token) return
    setFormError(null)
    try {
      const { error: apiError } = await authClient.resetPassword({ newPassword: password, token })
      if (apiError) {
        if (apiError.code === 'INVALID_TOKEN') setLinkInvalid(true)
        else if (isPasswordError(apiError)) setError('password', { message: authErrorMessage(apiError) }, { shouldFocus: true })
        else setFormError(authErrorMessage(apiError))
        return
      }
      await navigate({ to: '/sign-in', search: { notice: 'password-reset' } })
    } catch {
      setFormError(NETWORK_ERROR_MESSAGE)
    }
  }

  if (linkInvalid) {
    return (
      <>
        <span className="mb-5 flex size-11 items-center justify-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <TriangleAlert className="size-5" aria-hidden />
        </span>
        <AuthHeading
          title="This link is invalid or has expired"
          description="Password reset links work once and expire after 1 hour. Request a new one to continue."
        />
        <Button asChild className="h-10 w-full rounded-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </>
    )
  }

  return (
    <>
      <AuthHeading
        title="Choose a new password"
        description="After you save it, you'll be signed out on every device and can sign in again with the new password."
      />

      {formError ? <FormMessage tone="error">{formError}</FormMessage> : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
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
          {isSubmitting ? 'Saving...' : 'Save new password'}
        </Button>
      </form>
    </>
  )
}
