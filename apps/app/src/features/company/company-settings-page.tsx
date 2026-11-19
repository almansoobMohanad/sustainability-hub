import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@hub/ui/components/button'
import { Input } from '@hub/ui/components/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hub/ui/components/select'
import { Skeleton } from '@hub/ui/components/skeleton'
import { toast } from '@hub/ui/components/sonner'
import { ROLE_DESCRIPTIONS, can } from '@hub/shared/permissions'
import { SECTORS, SECTOR_INFO, type Sector } from '@hub/shared/sectors'
import { PageHeader } from '@/components/page-header'
import { PageBody, PageSection, PageTitle } from '@/components/page-layout'
import { companySettingsQueryOptions, useUpdateCompanySettings } from '@/features/factors/queries'
import { errorMessage } from '@/lib/api'
import { authClient } from '@/lib/auth-client'
import { NETWORK_ERROR_MESSAGE } from '@/features/auth/auth-errors'
import { companyErrorMessage } from './company-errors'
import { meQueryOptions, useMe } from './me'
import { RolePill } from './role-pill'

/*
  Company settings: name, sector, how entries are verified (Admins change
  them; everyone sees them) and your own role. One flat section per setting,
  each saved on its own (its Save button appears once something changed);
  outcomes are toasts.
*/
export function CompanySettingsPage() {
  const me = useMe()
  const company = me.company!
  const canEdit = can(me.role, 'organization', 'update')

  return (
    <>
      <PageHeader title="Company settings" />
      <PageBody className="max-w-5xl gap-2">
        <PageTitle title="Company settings" info={`Settings of ${company.name}. Admins can change them; everyone can see them.`} />

        {!canEdit ? (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-muted/60 px-4 py-2.5 text-sm text-muted-foreground">
            <Lock className="size-4 shrink-0" aria-hidden />
            Only Admins can change company settings.
          </p>
        ) : null}

        <div className="divide-y">
          <PageSection id="settings-name" title="Company name" info="Shown in the app and in invitation emails.">
            <NameSetting companyId={company.id} name={company.name} canEdit={canEdit} />
          </PageSection>

          <PageSection
            id="settings-sector"
            title="Sector"
            info="Used to suggest emission sources. Changing it doesn't change the sources you track; the Add sources dialog on Emission sources then suggests the new sector's sources."
          >
            <SectorSetting companyId={company.id} canEdit={canEdit} />
          </PageSection>

          <PageSection id="settings-verification" title="Verification" info="How new emission entries are reviewed. A change applies to new entries only.">
            <VerificationSetting companyId={company.id} canEdit={canEdit} />
          </PageSection>

          <PageSection id="settings-role" title="Your role" info="Roles are given and changed on the Members page.">
            <div className="flex flex-col gap-2">
              {me.role ? <RolePill role={me.role} /> : null}
              <p className="text-sm text-muted-foreground">{me.role ? ROLE_DESCRIPTIONS[me.role] : null}</p>
            </div>
            <Button asChild variant="outline" size="sm" className="w-fit rounded-full">
              <Link to="/settings/members">Go to Members</Link>
            </Button>
          </PageSection>
        </div>
      </PageBody>
    </>
  )
}

const nameSchema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters').max(100, 'Use at most 100 characters'),
})
type NameValues = z.infer<typeof nameSchema>

function NameSetting({ companyId, name, canEdit }: { companyId: string; name: string; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<NameValues>({ resolver: zodResolver(nameSchema), values: { name } })

  async function onSubmit(values: NameValues) {
    try {
      const { error } = await authClient.organization.update({ organizationId: companyId, data: { name: values.name } })
      if (error) {
        toast.error(companyErrorMessage(error))
        return
      }
      await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey })
      reset({ name: values.name })
      toast.success('Company name saved')
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE)
    }
  }

  if (!canEdit) return <p className="text-sm">{name}</p>
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="company-name"
          aria-label="Company name"
          autoComplete="organization"
          className="h-10 sm:max-w-sm"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'company-name-error' : undefined}
          {...register('name')}
        />
        {isDirty ? (
          <Button type="submit" className="h-10 w-fit rounded-full px-5" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save'}
          </Button>
        ) : null}
      </div>
      {errors.name ? (
        <p id="company-name-error" className="text-sm text-destructive">
          {errors.name.message}
        </p>
      ) : null}
    </form>
  )
}

/*
  The company's sector. It chose the starting template of emission sources;
  changing it later doesn't change the sources (that would silently remove
  things people track), but the Add sources dialog then suggests the new
  sector's sources.
*/
function SectorSetting({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const settings = useQuery(companySettingsQueryOptions(companyId))
  const update = useUpdateCompanySettings(companyId)
  const [choice, setChoice] = useState<Sector | null>(null)
  const saved = settings.data?.sector ?? null
  const selected = choice ?? saved

  async function save() {
    if (!selected) return
    try {
      await update.mutateAsync({ sector: selected })
      setChoice(null)
      toast.success('Sector saved')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  if (settings.isPending) return <Skeleton className="h-10 w-full max-w-sm" />
  if (!canEdit) return <p className="text-sm">{saved ? SECTOR_INFO[saved].label : 'Not chosen yet'}</p>
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select value={selected ?? ''} onValueChange={(value) => setChoice(value as Sector)}>
        <SelectTrigger aria-label="Sector" className="w-full data-[size=default]:h-10 sm:max-w-sm">
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
      {choice && choice !== saved ? (
        <Button className="h-10 w-fit rounded-full px-5" onClick={save} disabled={update.isPending}>
          {update.isPending ? 'Saving...' : 'Save'}
        </Button>
      ) : null}
    </div>
  )
}

const VERIFICATION_OPTIONS = [
  {
    value: true,
    label: 'Managers verify entries',
    description: 'New entries start as Pending until a Manager or Admin verifies or rejects them. Recommended for reported figures.',
  },
  {
    value: false,
    label: 'Verify automatically',
    description: 'New entries are verified as soon as they are added. Suits small teams where one person enters all data.',
  },
] as const

/*
  Whether new entries need a Manager's or Admin's verification (the default)
  or are verified automatically. Changing it affects new entries only.
*/
function VerificationSetting({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const settings = useQuery(companySettingsQueryOptions(companyId))
  const update = useUpdateCompanySettings(companyId)
  const [choice, setChoice] = useState<boolean | null>(null)
  const saved = settings.data?.requireVerification ?? true
  const selected = choice ?? saved

  async function save() {
    try {
      await update.mutateAsync({ requireVerification: selected })
      setChoice(null)
      toast.success('Verification setting saved', { description: 'It applies to new entries.' })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  if (settings.isPending) return <Skeleton className="h-24 w-full" />
  return (
    <>
      {/* The two choices as selectable options (native radio buttons, keyboard friendly) */}
      <fieldset className="grid gap-3 sm:grid-cols-2" disabled={!canEdit}>
        <legend className="sr-only">Verification of new entries</legend>
        {VERIFICATION_OPTIONS.map((option) => (
          <label
            key={String(option.value)}
            className="flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition-colors hover:bg-muted/40 has-checked:border-emerald-600 has-checked:bg-emerald-50/50 has-checked:ring-1 has-checked:ring-emerald-600 has-disabled:cursor-default has-disabled:hover:bg-transparent has-focus-visible:ring-3 has-focus-visible:ring-ring/50 motion-reduce:transition-none dark:has-checked:bg-emerald-950/30"
          >
            <input
              type="radio"
              name="require-verification"
              className="sr-only"
              checked={selected === option.value}
              onChange={() => setChoice(option.value)}
            />
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-xs leading-relaxed text-muted-foreground">{option.description}</span>
          </label>
        ))}
      </fieldset>
      {canEdit && choice !== null && choice !== saved ? (
        <Button className="h-10 w-fit rounded-full px-5" onClick={save} disabled={update.isPending}>
          {update.isPending ? 'Saving...' : 'Save'}
        </Button>
      ) : null}
    </>
  )
}
