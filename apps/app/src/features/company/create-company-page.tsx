import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Building2, MailOpen } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@hub/ui/components/button'
import { Checkbox } from '@hub/ui/components/checkbox'
import { Input } from '@hub/ui/components/input'
import { Label } from '@hub/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hub/ui/components/select'
import { Skeleton } from '@hub/ui/components/skeleton'
import { ROLE_LABELS, isRole } from '@hub/shared/permissions'
import { SECTORS, SECTOR_INFO, type Sector } from '@hub/shared/sectors'
import { authClient } from '@/lib/auth-client'
import { api } from '@/lib/api'
import { NETWORK_ERROR_MESSAGE } from '@/features/auth/auth-errors'
import { AuthHeading, FieldError, FormMessage } from '@/features/auth/auth-parts'
import { SCOPE_INFO } from '@/features/emissions/types'
import { sectorTemplateQueryOptions, type Scope } from '@/features/factors/queries'
import { companyErrorMessage } from './company-errors'
import { forgetCompanyData, meQueryOptions } from './me'
import { myInvitationsQueryOptions } from './my-invitations'
import { companySlug } from './slug'

const schema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters').max(100, 'Use at most 100 characters'),
  sector: z.enum(SECTORS, { error: 'Choose the sector closest to what your company does' }),
})
type Values = z.infer<typeof schema>

/*
  After signing up (or when someone has no company): create a company and
  become its Admin, or join one they've been invited to.

  The sector picks a template of emission sources (what the company will
  measure); people untick what doesn't apply. Everything can be changed later
  on the Emission sources page.
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
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '' } })

  const sector = useWatch({ control, name: 'sector' }) as Sector | undefined
  // Only the chosen sector's template is fetched (a few dozen sources)
  const templates = useQuery({ ...sectorTemplateQueryOptions(sector ?? 'other'), enabled: sector !== undefined })
  const templateSources = sector ? (templates.data ?? []) : []
  // Unticked sources, per sector (switching sectors keeps each one's choices)
  const [unticked, setUnticked] = useState<Partial<Record<Sector, Set<string>>>>({})
  const isTicked = (id: string) => !(sector && unticked[sector]?.has(id))
  const tickedCount = templateSources.filter((source) => isTicked(source.id)).length

  function toggle(id: string, ticked: boolean) {
    if (!sector) return
    setUnticked((previous) => {
      const next = new Set(previous[sector])
      if (ticked) next.delete(id)
      else next.add(id)
      return { ...previous, [sector]: next }
    })
  }

  async function onSubmit({ name, sector }: Values) {
    setFormError(null)
    try {
      // The new company becomes the active one automatically, and its creator its Admin
      const { error } = await authClient.organization.create({ name, slug: companySlug(name) })
      if (error) {
        setFormError(companyErrorMessage(error))
        return
      }
      forgetCompanyData(queryClient)
      const chosen = templateSources.filter((source) => isTicked(source.id))
      try {
        await api('/company/settings', { method: 'PATCH', json: { sector } })
        if (chosen.length > 0) {
          await api('/company/sources', {
            method: 'POST',
            json: { sources: chosen.map((source) => ({ sourceId: source.id, defaultUnit: source.defaultUnit })) },
          })
        }
      } catch {
        // The company exists; its sources can be chosen on the Emission sources page
        await navigate({ to: '/settings/sources' })
        return
      }
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

        <div className="space-y-2">
          <Label htmlFor="sector">Sector</Label>
          <Controller
            control={control}
            name="sector"
            render={({ field }) => (
              <Select value={field.value ?? ''} onValueChange={field.onChange}>
                <SelectTrigger
                  id="sector"
                  className="w-full"
                  aria-invalid={Boolean(errors.sector)}
                  aria-describedby={errors.sector ? 'sector-error' : 'sector-hint'}
                  onBlur={field.onBlur}
                >
                  <SelectValue placeholder="Choose a sector" />
                </SelectTrigger>
                <SelectContent>
                  {SECTORS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {SECTOR_INFO[option].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.sector ? (
            <FieldError id="sector-error" message={errors.sector.message} />
          ) : (
            <p id="sector-hint" className="text-sm text-muted-foreground">
              {sector ? SECTOR_INFO[sector].description : 'Suggests what your company should measure.'}
            </p>
          )}
        </div>

        {sector ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Emission sources to track{' '}
              <span className="font-normal text-muted-foreground">
                ({tickedCount} of {templateSources.length})
              </span>
            </legend>
            {templates.isPending ? (
              <div className="space-y-2" aria-hidden>
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : templates.isError ? (
              <p className="text-sm text-muted-foreground">
                The suggestions couldn&apos;t be loaded. You can choose sources after creating the company.
              </p>
            ) : (
              <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border p-3">
                {([1, 2, 3] as Scope[]).map((scope) => {
                  const inScope = templateSources.filter((source) => source.scope === scope)
                  if (inScope.length === 0) return null
                  return (
                    <div key={scope}>
                      <p className="text-xs font-medium text-muted-foreground">{SCOPE_INFO[scope].label}</p>
                      <ul className="mt-1 space-y-1">
                        {inScope.map((source) => (
                          <li key={source.id}>
                            <label className="flex cursor-pointer items-start gap-2 rounded-md py-1 text-sm">
                              <Checkbox
                                className="mt-0.5"
                                checked={isTicked(source.id)}
                                onCheckedChange={(checked) => toggle(source.id, checked === true)}
                              />
                              <span className="min-w-0 [overflow-wrap:anywhere]">
                                {source.name}
                                <span className="block text-xs text-muted-foreground">{source.category}</span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              You can add or remove sources any time under Company, Emission sources.
            </p>
          </fieldset>
        ) : null}

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
