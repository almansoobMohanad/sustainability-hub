import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { z } from 'zod'
import { Badge } from '@hub/ui/components/badge'
import { Button } from '@hub/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hub/ui/components/card'
import { Input } from '@hub/ui/components/input'
import { Label } from '@hub/ui/components/label'
import { ROLE_DESCRIPTIONS, ROLE_LABELS, can } from '@hub/shared/permissions'
import { PageHeader } from '@/components/page-header'
import { authClient } from '@/lib/auth-client'
import { NETWORK_ERROR_MESSAGE } from '@/features/auth/auth-errors'
import { companyErrorMessage } from './company-errors'
import { meQueryOptions, useMe } from './me'

const schema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters').max(100, 'Use at most 100 characters'),
})
type Values = z.infer<typeof schema>

/*
  Company settings. Today: the company name (Admins) and your role. Later:
  e.g. whether new emissions entries need a Manager's verification.
*/
export function CompanySettingsPage() {
  const me = useMe()
  const company = me.company!
  const canEdit = can(me.role, 'organization', 'update')
  const queryClient = useQueryClient()
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({ resolver: zodResolver(schema), values: { name: company.name } })

  async function onSubmit({ name }: Values) {
    setFeedback(null)
    try {
      const { error } = await authClient.organization.update({ organizationId: company.id, data: { name } })
      if (error) {
        setFeedback({ tone: 'error', text: companyErrorMessage(error) })
        return
      }
      await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey })
      reset({ name })
      setFeedback({ tone: 'success', text: 'Company name saved.' })
    } catch {
      setFeedback({ tone: 'error', text: NETWORK_ERROR_MESSAGE })
    }
  }

  return (
    <>
      <PageHeader title="Company settings" demoData={false} />
      <div className="grid w-full max-w-3xl gap-6 p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Company details</CardTitle>
            <CardDescription>
              {canEdit ? 'Shown in the app and in invitation emails.' : 'Only Admins can change company details.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company-name">Company name</Label>
                <Input
                  id="company-name"
                  autoComplete="organization"
                  readOnly={!canEdit}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'company-name-error' : undefined}
                  {...register('name')}
                />
                {errors.name ? (
                  <p id="company-name-error" className="text-sm text-destructive">
                    {errors.name.message}
                  </p>
                ) : null}
              </div>
              {feedback ? (
                <p
                  role={feedback.tone === 'error' ? 'alert' : 'status'}
                  className={feedback.tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-emerald-700 dark:text-emerald-400'}
                >
                  {feedback.text}
                </p>
              ) : null}
              {canEdit ? (
                <Button type="submit" className="rounded-full" disabled={isSubmitting || !isDirty}>
                  {isSubmitting ? 'Saving...' : 'Save'}
                </Button>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your role</CardTitle>
            <CardDescription>Roles are managed on the Members page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge variant={me.role === 'admin' ? 'default' : 'secondary'}>{me.role ? ROLE_LABELS[me.role] : 'Member'}</Badge>
            <p className="text-sm text-muted-foreground">{me.role ? ROLE_DESCRIPTIONS[me.role] : null}</p>
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/settings/members">Go to Members</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
