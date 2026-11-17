import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Building2, MailOpen } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@hub/ui/components/button'
import { Input } from '@hub/ui/components/input'
import { Label } from '@hub/ui/components/label'
import { ROLE_LABELS, isRole } from '@hub/shared/permissions'
import { authClient } from '@/lib/auth-client'
import { NETWORK_ERROR_MESSAGE } from '@/features/auth/auth-errors'
import { AuthHeading, FieldError, FormMessage } from '@/features/auth/auth-parts'
import { companyErrorMessage } from './company-errors'
import { forgetCompanyData, meQueryOptions } from './me'
import { myInvitationsQueryOptions } from './my-invitations'
import { companySlug } from './slug'

const schema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters').max(100, 'Use at most 100 characters'),
})
type Values = z.infer<typeof schema>

/*
  After signing up (or when someone has no company): create a company and
  become its Admin, or join one they've been invited to.
*/
export function CreateCompanyPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const { data: me } = useQuery(meQueryOptions)
  const { data: invitations = [] } = useQuery(myInvitationsQueryOptions)
  const hasCompany = (me?.companies.length ?? 0) > 0
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '' } })

  async function onSubmit({ name }: Values) {
    setFormError(null)
    try {
      // The new company becomes the active one automatically
      const { error } = await authClient.organization.create({ name, slug: companySlug(name) })
      if (error) {
        setFormError(companyErrorMessage(error))
        return
      }
      forgetCompanyData(queryClient)
      await navigate({ to: '/' })
    } catch {
      setFormError(NETWORK_ERROR_MESSAGE)
    }
  }

  return (
    <>
      <span className="mb-5 flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        <Building2 className="size-5" aria-hidden />
      </span>
      <AuthHeading
        title={hasCompany ? 'Create another company' : 'Set up your company'}
        description="Emissions data, reports and your team all belong to a company. You'll be its Admin."
      />

      {invitations.length > 0 ? (
        <section aria-labelledby="invitations-heading" className="mb-6 rounded-xl border bg-muted/40 p-4">
          <h2 id="invitations-heading" className="flex items-center gap-2 text-sm font-medium">
            <MailOpen className="size-4 text-muted-foreground" aria-hidden />
            You&apos;ve been invited
          </h2>
          <ul className="mt-3 space-y-2">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{invitation.organizationName}</span>
                  <span className="text-muted-foreground">
                    as {isRole(invitation.role) ? ROLE_LABELS[invitation.role] : invitation.role}
                  </span>
                </span>
                <Button asChild size="sm" className="shrink-0 rounded-full">
                  <Link to="/invitations/$invitationId" params={{ invitationId: invitation.id }}>
                    View
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {formError ? <FormMessage tone="error">{formError}</FormMessage> : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Company name</Label>
          <Input
            id="name"
            autoComplete="organization"
            placeholder="e.g. Green Steel Sdn Bhd"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'name-error' : undefined}
            {...register('name')}
          />
          <FieldError id="name-error" message={errors.name?.message} />
        </div>
        <Button type="submit" className="h-10 w-full rounded-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create company'}
        </Button>
      </form>

      {hasCompany ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/" className="font-medium text-foreground underline underline-offset-4">
            Back to the dashboard
          </Link>
        </p>
      ) : null}
    </>
  )
}
