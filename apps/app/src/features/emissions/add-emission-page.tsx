import { useEffect, useMemo, type FormEvent, type ReactNode } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Check, FileUp, Layers, Loader2 } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@hub/ui/components/button'
import { Input } from '@hub/ui/components/input'
import { Label } from '@hub/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hub/ui/components/select'
import { Skeleton } from '@hub/ui/components/skeleton'
import { toast } from '@hub/ui/components/sonner'
import { Textarea } from '@hub/ui/components/textarea'
import { cn } from '@hub/ui/lib/utils'
import { ENTRY_LIMITS, PERIOD_PATTERN } from '@hub/shared/emissions'
import { can } from '@hub/shared/permissions'
import { InfoTip } from '@/components/info-tip'
import { PageHeader } from '@/components/page-header'
import { PageBody, PageSection, PageTitle } from '@/components/page-layout'
import { useMe } from '@/features/company/me'
import { formatFactor, perUnit, unitLabel } from '@/features/factors/format'
import { companySourcesQueryOptions, type CompanySource } from '@/features/factors/queries'
import { ImportDialog } from '@/features/imports/import-dialog'
import { errorMessage } from '@/lib/api'
import { currentPeriod, formatNumber, formatPeriod, formatTonnes } from '@/lib/format'
import { useCreateEntry } from './queries'
import { SCOPES, SCOPE_INFO } from './types'

/*
  Add one activity (fuel used, electricity bought, distance travelled...).
  The choices come from the company's own emission sources (Company >
  Emission sources), with the factors of the reporting month's year. The
  calculation shown here is a preview; the server calculates and stores the
  real value with the factor it used.

  "Import from file" (next to the title) opens the spreadsheet import dialog,
  for many entries at once.

  Layout: one flat form in numbered steps (Activity, Quantity, Evidence) that
  ends in the live result (Emissions) and the buttons, all on the same grid;
  explanations sit behind (i) buttons instead of always-visible helper text.
  (A floating result bar pinned to the bottom was tried; the user found it odd.)
*/

const schema = z.object({
  scope: z.enum(['1', '2', '3']),
  category: z.string().min(1, 'Choose a category'),
  sourceId: z.string().min(1, 'Choose an emission source'),
  unit: z.string().min(1, 'Choose a unit'),
  amount: z
    .number({ error: 'Enter an amount' })
    .positive('Enter an amount greater than 0')
    .max(ENTRY_LIMITS.maxAmount, 'That amount looks too large'),
  period: z
    .string()
    .regex(PERIOD_PATTERN, 'Choose a reporting month')
    .refine((p) => Number(p.slice(0, 4)) >= ENTRY_LIMITS.firstYear, `Choose ${ENTRY_LIMITS.firstYear} or later`)
    .refine((p) => p <= currentPeriod(), "The reporting month can't be in the future"),
  dataSource: z.string().trim().max(ENTRY_LIMITS.dataSourceLength, 'Keep this under 200 characters'),
  notes: z.string().trim().max(ENTRY_LIMITS.notesLength, 'Keep notes under 1,000 characters'),
})

type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

const scopeColor = (scope: string) => `var(--scope-${scope})`

/** Taller controls than the kit's default (h-8): this page is a form people spend time in */
const FIELD = 'h-10'

/**
 * Notes grow with their text through CSS (field-sizing: content, in the kit's
 * Textarea). Browsers without it get the same from this input handler.
 */
const textareaGrowsByItself = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')
function growTextarea(event: FormEvent<HTMLTextAreaElement>) {
  if (textareaGrowsByItself) return
  const textarea = event.currentTarget
  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight + 2}px` // + the 1px borders
}

export function AddEmissionPage() {
  const me = useMe()
  const company = me.company!
  const navigate = useNavigate()
  const createEntry = useCreateEntry(company.id)

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setFocus,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    mode: 'onTouched', // show a field's error after leaving it, then live
    defaultValues: {
      scope: '1',
      category: '',
      sourceId: '',
      unit: '',
      amount: undefined,
      period: currentPeriod(),
      dataSource: '',
      notes: '',
    },
  })

  const [scope, category, sourceId, unit, amount, period, dataSource, notes] = useWatch({
    control,
    name: ['scope', 'category', 'sourceId', 'unit', 'amount', 'period', 'dataSource', 'notes'],
  })

  // The company's sources with the factors of the reporting month's year
  const year = PERIOD_PATTERN.test(period) ? Number(period.slice(0, 4)) : new Date().getFullYear()
  const sourcesQuery = useQuery(companySourcesQueryOptions(company.id, year))
  const sources = useMemo(() => sourcesQuery.data?.sources ?? [], [sourcesQuery.data])

  // Options narrow down: scope -> category -> source -> unit
  const countByScope = (s: string) => sources.filter((source) => String(source.scope) === s).length
  const categories = useMemo(
    () => [...new Set(sources.filter((s) => String(s.scope) === scope).map((s) => s.category))],
    [sources, scope],
  )
  const sourcesInCategory = (cat: string) => sources.filter((s) => String(s.scope) === scope && s.category === cat)
  const source = sources.find((s) => s.id === sourceId)
  const factor = source?.factors.find((f) => f.unit === unit)

  // Start on the first scope that has sources
  const firstScope = SCOPES.find((s) => sources.some((source) => source.scope === s))
  useEffect(() => {
    if (firstScope && countByScope(scope) === 0) setValue('scope', String(firstScope) as FormInput['scope'])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the list of sources arrives
  }, [firstScope])

  /** A source was chosen: offer its default unit (or its only/first one) */
  function chooseSource(id: string) {
    const chosen = sources.find((s) => s.id === id)
    setValue('sourceId', id, { shouldValidate: true })
    const units = chosen?.factors.map((f) => f.unit) ?? []
    setValue('unit', chosen?.defaultUnit && units.includes(chosen.defaultUnit) ? chosen.defaultUnit : (units[0] ?? ''), {
      shouldValidate: Boolean(chosen),
    })
  }

  const onSubmit = async (values: FormOutput) => {
    const entry = await createEntry
      .mutateAsync({
        sourceId: values.sourceId,
        unit: values.unit,
        amount: values.amount,
        period: values.period,
        dataSource: values.dataSource || null,
        notes: values.notes || null,
      })
      .catch(() => null) // the error is shown from createEntry.error
    if (!entry) return

    toast.success(`Entry added: ${formatTonnes(entry.co2eKg, 2)} t CO2e`, {
      description: `${formatNumber(entry.amount)} ${unitLabel(entry.unit)} of ${entry.source.name}, ${formatPeriod(entry.period, 'long')}. ${
        entry.status === 'verified'
          ? 'Verified automatically (company setting).'
          : 'Pending until a Manager or Admin verifies it.'
      }`,
      action: { label: 'View entries', onClick: () => void navigate({ to: '/emissions' }) },
    })
    // Keep the choices (handy for adding several similar entries), clear the rest.
    // The amount is reset to '' (not undefined): React Hook Form ignores undefined
    // and would leave the old number in the input.
    reset({ ...values, amount: '' as unknown as number, dataSource: '', notes: '' })
    // Ready for the next one (e.g. the next month's bill)
    setTimeout(() => setFocus('amount'))
  }

  const fieldError = (message?: string, id?: string) =>
    message ? (
      <p id={id} className="text-sm text-destructive">
        {message}
      </p>
    ) : null

  const noSources = sourcesQuery.isSuccess && sources.length === 0
  const amountValid = typeof amount === 'number' && Number.isFinite(amount) && amount > 0
  const activityDone = Boolean(source && factor)
  const quantityDone = amountValid && !errors.amount && PERIOD_PATTERN.test(period) && !errors.period
  const evidenceDone = Boolean(dataSource?.trim() || notes?.trim())

  return (
    <>
      <PageHeader title="Add emissions" />

      {/* gap-0 pb-0: the form's own section spacing keeps the whole form on one laptop screen */}
      <PageBody className="max-w-5xl gap-0 pb-0">
        <PageTitle
          title="Record an activity"
          infoLabel="About adding emissions"
          info={
            <>
              <span>
                One entry is one activity in one month, such as fuel used, electricity bought or distance travelled.
              </span>
              <span>
                Emissions are calculated with the emission factor of the reporting month&apos;s year. New entries are
                Pending until a Manager or Admin verifies them.
              </span>
            </>
          }
          actions={
            noSources ? null : (
              <ImportDialog
                trigger={
                  <Button variant="outline" className="h-9 rounded-full px-4">
                    <FileUp aria-hidden />
                    Import from file
                  </Button>
                }
              />
            )
          }
        />

        {noSources ? (
          <NoSources canChoose={can(me.role, 'sources', 'update')} />
        ) : (
          <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col pb-6">
            <div className="divide-y">
              <Section
                step={1}
                title="Activity"
                done={activityDone}
                info="What happened: the scope, the kind of activity and the exact emission source. The list shows the sources your company tracks (Company > Emission sources)."
              >
                {/* Scope: a segmented control (native radio buttons, keyboard friendly) */}
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 flex items-center gap-1 text-sm font-medium">
                    Scope
                    <InfoTip label="About scopes">
                      {SCOPES.map((s) => (
                        <span key={s}>
                          <span className="font-medium">{SCOPE_INFO[s].label}:</span> {SCOPE_INFO[s].description}.
                        </span>
                      ))}
                    </InfoTip>
                  </legend>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
                    {SCOPES.map((s) => {
                      const count = countByScope(String(s))
                      const none = sourcesQuery.isSuccess && count === 0
                      return (
                        <label
                          key={s}
                          className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow] hover:text-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-disabled:cursor-not-allowed has-disabled:opacity-40 has-disabled:hover:text-muted-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50 motion-reduce:transition-none"
                        >
                          <input
                            type="radio"
                            value={String(s)}
                            className="sr-only"
                            disabled={none}
                            {...register('scope', {
                              onChange: () => {
                                // A different scope means different categories and sources
                                setValue('category', '')
                                setValue('sourceId', '')
                                setValue('unit', '')
                              },
                            })}
                          />
                          <span className="size-2 shrink-0 rounded-full" style={{ background: scopeColor(String(s)) }} aria-hidden />
                          {SCOPE_INFO[s].label}
                          <span className="hidden font-normal text-muted-foreground sm:inline">{SCOPE_INFO[s].short}</span>
                          {none && <span className="sr-only">(no sources tracked)</span>}
                        </label>
                      )
                    })}
                  </div>
                </fieldset>

                <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  <div className="flex min-w-0 flex-col gap-2">
                    <Label htmlFor="category">Category</Label>
                    <Controller
                      control={control}
                      name="category"
                      render={({ field, fieldState }) => (
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value)
                            // Pre-select the source when a category has only one
                            const options = sourcesInCategory(value)
                            if (options.length === 1) chooseSource(options[0].id)
                            else {
                              setValue('sourceId', '')
                              setValue('unit', '')
                            }
                          }}
                          disabled={!sourcesQuery.isSuccess}
                        >
                          <SelectTrigger
                            id="category"
                            className="w-full data-[size=default]:h-10"
                            aria-invalid={fieldState.invalid}
                            aria-describedby={fieldState.error ? 'category-error' : undefined}
                            onBlur={field.onBlur}
                          >
                            <SelectValue placeholder={sourcesQuery.isPending ? 'Loading...' : 'Choose a category'} />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {fieldError(errors.category?.message, 'category-error')}
                  </div>

                  <div className="flex min-w-0 flex-col gap-2">
                    <Label htmlFor="sourceId">Emission source</Label>
                    <Controller
                      control={control}
                      name="sourceId"
                      render={({ field, fieldState }) => (
                        <Select value={field.value} onValueChange={chooseSource} disabled={!category}>
                          <SelectTrigger
                            id="sourceId"
                            className="w-full data-[size=default]:h-10"
                            aria-invalid={fieldState.invalid}
                            aria-describedby={fieldState.error ? 'source-error' : undefined}
                            onBlur={field.onBlur}
                          >
                            <SelectValue placeholder={category ? 'Choose a source' : 'Choose a category first'} />
                          </SelectTrigger>
                          <SelectContent>
                            {sourcesInCategory(category).map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {fieldError(errors.sourceId?.message, 'source-error')}
                  </div>
                </div>
              </Section>

              <Section
                step={2}
                title="Quantity"
                done={quantityDone}
                info="How much, in which unit, and the month it belongs to. The month's year decides which year's emission factor is used."
              >
                <div className="grid gap-5 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                  <div className="flex min-w-0 flex-col gap-2">
                    <Label htmlFor="amount">Amount</Label>
                    {/* Amount and unit as one control: the number with its unit attached */}
                    <div
                      className={cn(
                        'flex rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20',
                        FIELD,
                      )}
                    >
                      <input
                        id="amount"
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        placeholder="0"
                        // No browser spinner arrows: nobody steps litres by 1, and they crowd the unit
                        className="min-w-0 flex-1 [appearance:textfield] rounded-l-lg bg-transparent px-3 text-base tabular-nums outline-none placeholder:text-muted-foreground md:text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        aria-invalid={Boolean(errors.amount)}
                        aria-describedby={errors.amount ? 'amount-error' : undefined}
                        {...register('amount', { valueAsNumber: true })}
                      />
                      <Controller
                        control={control}
                        name="unit"
                        render={({ field, fieldState }) => (
                          <Select value={field.value} onValueChange={field.onChange} disabled={!source}>
                            <SelectTrigger
                              id="unit"
                              aria-label="Unit"
                              className="h-full shrink-0 gap-2 rounded-l-none rounded-r-lg border-0 border-l bg-muted/50 px-3 focus-visible:ring-0 aria-invalid:ring-0 data-[size=default]:h-full"
                              aria-invalid={fieldState.invalid}
                              aria-describedby={fieldState.error ? 'unit-error' : undefined}
                              onBlur={field.onBlur}
                            >
                              <SelectValue placeholder="Unit" />
                            </SelectTrigger>
                            <SelectContent align="end">
                              {(source?.factors ?? []).map((f) => (
                                <SelectItem key={f.unit} value={f.unit}>
                                  {unitLabel(f.unit)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    {fieldError(errors.amount?.message, 'amount-error')}
                    {fieldError(errors.unit?.message, 'unit-error')}
                  </div>

                  <div className="flex min-w-0 flex-col gap-2">
                    <Label htmlFor="period">Reporting month</Label>
                    <Input
                      id="period"
                      type="month"
                      className={FIELD}
                      min={`${ENTRY_LIMITS.firstYear}-01`}
                      max={currentPeriod()}
                      aria-invalid={Boolean(errors.period)}
                      aria-describedby={errors.period ? 'period-error' : undefined}
                      {...register('period')}
                    />
                    {fieldError(errors.period?.message, 'period-error')}
                  </div>
                </div>
              </Section>

              <Section
                step={3}
                title="Evidence"
                optional
                done={evidenceDone}
                info="Where the number comes from and anything a reviewer should know. Shown to whoever verifies the entry and kept in its history."
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="dataSource">Data source</Label>
                  <Input
                    id="dataSource"
                    className={FIELD}
                    placeholder="e.g. Electricity bill INV-2026-031"
                    aria-invalid={Boolean(errors.dataSource)}
                    {...register('dataSource')}
                  />
                  {fieldError(errors.dataSource?.message)}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="notes">Notes</Label>
                  {/* Grows with the text (up to a limit, then scrolls); no drag handle */}
                  <Textarea
                    id="notes"
                    placeholder="e.g. Estimated from meter readings"
                    className="max-h-60 min-h-20 resize-none"
                    aria-invalid={Boolean(errors.notes)}
                    onInput={growTextarea}
                    {...register('notes')}
                  />
                  {fieldError(errors.notes?.message)}
                </div>
              </Section>

              <Section
                step={4}
                title="Emissions"
                done={Boolean(source && factor && amountValid && !sourcesQuery.isPlaceholderData)}
                info="Amount × emission factor. This is a preview: when you add the entry, the server calculates and stores the value with the factor it used."
              >
                <Result
                  source={source}
                  factor={factor}
                  amount={amountValid ? amount : undefined}
                  year={year}
                  loading={sourcesQuery.isPending}
                  // While another year's factors load, the previous year's are still on screen: never show those
                  loadingYear={sourcesQuery.isPlaceholderData}
                />

                {createEntry.isError && (
                  <p role="alert" className="text-sm text-destructive">
                    Couldn&apos;t save the entry: {errorMessage(createEntry.error)}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" className="h-10 rounded-full px-5" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
                    {isSubmitting ? 'Adding...' : 'Add entry'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 rounded-full px-4"
                    onClick={() => {
                      reset()
                      createEntry.reset()
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </Section>
            </div>
          </form>
        )}
      </PageBody>
    </>
  )
}

/** One step of the form: number (a tick once filled in) and title on the left, fields on the right. */
function Section({
  step,
  title,
  info,
  done,
  optional,
  children,
}: {
  step: number
  title: string
  info: string
  done: boolean
  optional?: boolean
  children: ReactNode
}) {
  return (
    <PageSection
      id={`step-${step}`}
      title={title}
      info={info}
      note={optional ? 'Optional' : undefined}
      mark={
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums text-muted-foreground transition-colors motion-reduce:transition-none',
            done && 'border-emerald-600 bg-emerald-600 text-white',
          )}
          aria-hidden
        >
          {done ? <Check className="size-3.5" strokeWidth={3} /> : step}
        </span>
      }
    >
      {children}
    </PageSection>
  )
}

/** The live calculation: the result in tonnes, and how it was worked out. */
function Result({
  source,
  factor,
  amount,
  year,
  loading,
  loadingYear,
}: {
  source?: CompanySource
  factor?: CompanySource['factors'][number]
  amount?: number
  year: number
  loading: boolean
  loadingYear: boolean
}) {
  const ready = !loadingYear && source && factor && amount !== undefined
  const co2eKg = ready ? amount * factor.kgCo2ePerUnit : 0

  let detail: ReactNode
  if (loading || loadingYear) {
    detail = loadingYear ? `Loading the ${year} emission factors...` : 'Loading your emission sources...'
  } else if (ready) {
    detail = (
      <>
        <span className="text-foreground tabular-nums">
          {formatNumber(amount)} {unitLabel(factor.unit)}
          <span className="px-1.5 text-muted-foreground">×</span>
          {formatFactor(factor.kgCo2ePerUnit)} {perUnit(factor.unit)}
        </span>{' '}
        <span className="whitespace-nowrap tabular-nums">= {formatNumber(co2eKg, 1)} kg CO2e</span>
        <span className="px-1.5" aria-hidden>
          ·
        </span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap align-middle">
          UK {factor.year} factor
          <InfoTip label="About this emission factor">
            {factor.year === year
              ? `UK Government GHG Conversion Factors ${factor.year}.`
              : factor.year < year
                ? `UK Government GHG Conversion Factors ${factor.year}. There is no ${year} factor for this source yet, so the latest earlier one is used.`
                : `UK Government GHG Conversion Factors ${factor.year}. There is no ${year} factor for this source, so the earliest available one is used.`}
          </InfoTip>
        </span>
      </>
    )
  } else {
    detail = 'Choose an emission source and enter an amount to see the result.'
  }

  return (
    <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-1">
      {loading || loadingYear ? (
        <Skeleton className="h-10 w-36" />
      ) : (
        <p className="flex items-baseline gap-2">
          <span className={cn('text-4xl font-semibold tracking-tight tabular-nums', !ready && 'text-muted-foreground/40')}>
            {formatTonnes(co2eKg, 2)}
          </span>
          <span className="text-muted-foreground">t CO2e</span>
        </p>
      )}
      <p className="text-sm text-muted-foreground">{detail}</p>
    </div>
  )
}

function NoSources({ canChoose }: { canChoose: boolean }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Layers className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <h3 className="font-medium">No emission sources yet</h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        Entries are added for the sources your company tracks, such as fuels, electricity and travel.
      </p>
      {canChoose ? (
        <Button asChild className="mt-2 rounded-full">
          <Link to="/settings/sources">Choose emission sources</Link>
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Ask an Admin or Manager to choose them.</p>
      )}
    </div>
  )
}
