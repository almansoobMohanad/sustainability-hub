import { useEffect, useMemo, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CircleCheck, Clock, Info } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@hub/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hub/ui/components/card'
import { Input } from '@hub/ui/components/input'
import { Label } from '@hub/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hub/ui/components/select'
import { Skeleton } from '@hub/ui/components/skeleton'
import { Textarea } from '@hub/ui/components/textarea'
import { ENTRY_LIMITS, PERIOD_PATTERN } from '@hub/shared/emissions'
import { can } from '@hub/shared/permissions'
import { PageHeader } from '@/components/page-header'
import { useMe } from '@/features/company/me'
import { formatFactor, perUnit, unitLabel } from '@/features/factors/format'
import { companySourcesQueryOptions, type CompanySource } from '@/features/factors/queries'
import { errorMessage } from '@/lib/api'
import { currentPeriod, formatNumber, formatPeriod, formatTonnes } from '@/lib/format'
import { useCreateEntry } from './queries'
import { SCOPES, SCOPE_INFO, type EmissionEntry } from './types'

/*
  Add one activity (fuel used, electricity bought, distance travelled...).
  The choices come from the company's own emission sources (Company >
  Emission sources), with the factors of the reporting month's year. The
  calculation shown here is a preview; the server calculates and stores the
  real value with the factor it used.
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

export function AddEmissionPage() {
  const me = useMe()
  const company = me.company!
  const createEntry = useCreateEntry(company.id)
  const [lastAdded, setLastAdded] = useState<EmissionEntry | null>(null)
  const successRef = useRef<HTMLDivElement>(null)

  const {
    register,
    control,
    handleSubmit,
    setValue,
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

  const [scope, category, sourceId, unit, amount, period] = useWatch({
    control,
    name: ['scope', 'category', 'sourceId', 'unit', 'amount', 'period'],
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
    setLastAdded(entry)
    // Keep the choices (handy for adding several similar entries), clear the rest.
    // The amount is reset to '' (not undefined): React Hook Form ignores undefined
    // and would leave the old number in the input.
    reset({ ...values, scope: values.scope, amount: '' as unknown as number, dataSource: '', notes: '' })
  }

  // Move focus to the confirmation so keyboard and screen-reader users notice it
  useEffect(() => {
    if (lastAdded) successRef.current?.focus()
  }, [lastAdded])

  const fieldError = (message?: string, id?: string) =>
    message ? (
      <p id={id} className="text-sm text-destructive">
        {message}
      </p>
    ) : null

  const noSources = sourcesQuery.isSuccess && sources.length === 0

  return (
    <>
      <PageHeader title="Add emissions" />

      <div className="grid w-full max-w-6xl gap-6 p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {lastAdded && (
            <div
              ref={successRef}
              tabIndex={-1}
              role="status"
              className="flex flex-col gap-3 rounded-xl border border-emerald-600/30 bg-emerald-50/60 p-4 outline-none sm:flex-row sm:items-center dark:bg-emerald-950/30"
            >
              {lastAdded.status === 'verified' ? (
                <CircleCheck className="size-5 shrink-0 text-[#0ca30c]" aria-hidden />
              ) : (
                <Clock className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <p className="flex-1 text-sm">
                <span className="font-medium">Entry added: </span>
                {formatNumber(lastAdded.amount)} {unitLabel(lastAdded.unit)} of {lastAdded.source.name} for{' '}
                {formatPeriod(lastAdded.period, 'long')} ={' '}
                <span className="font-medium">{formatTonnes(lastAdded.co2eKg, 2)} t CO2e</span>.{' '}
                {lastAdded.status === 'verified'
                  ? 'It was verified automatically (company setting).'
                  : 'It is Pending until a Manager or Admin verifies it.'}
              </p>
              <Button asChild size="sm" variant="outline" className="rounded-full px-3">
                <Link to="/emissions">View entries</Link>
              </Button>
            </div>
          )}

          {noSources ? (
            <Card>
              <CardHeader>
                <CardTitle>No emission sources yet</CardTitle>
                <CardDescription>
                  Entries are added for the sources your company tracks (fuels, electricity, travel...).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {can(me.role, 'sources', 'update') ? (
                  <Button asChild className="rounded-full">
                    <Link to="/settings/sources">Choose emission sources</Link>
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">Ask an Admin or Manager to choose them.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Activity details</CardTitle>
                <CardDescription>
                  Record one activity, such as fuel used, electricity bought or distance travelled. Emissions are
                  calculated with the emission factor of the reporting month&apos;s year.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
                  {/* Scope: three selectable cards (native radio buttons, keyboard friendly) */}
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-2 text-sm font-medium">Scope</legend>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {SCOPES.map((s) => {
                        const count = countByScope(String(s))
                        return (
                          <label
                            key={s}
                            className="flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors hover:bg-muted/50 has-checked:border-emerald-600 has-checked:bg-emerald-50/50 has-disabled:cursor-not-allowed has-disabled:opacity-50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50 dark:has-checked:bg-emerald-950/30"
                          >
                            <input
                              type="radio"
                              value={String(s)}
                              className="sr-only"
                              disabled={sourcesQuery.isSuccess && count === 0}
                              {...register('scope', {
                                onChange: () => {
                                  // A different scope means different categories and sources
                                  setValue('category', '')
                                  setValue('sourceId', '')
                                  setValue('unit', '')
                                },
                              })}
                            />
                            <span className="flex items-center gap-2 text-sm font-medium">
                              <span className="size-2.5 rounded-sm" style={{ background: scopeColor(String(s)) }} aria-hidden />
                              {SCOPE_INFO[s].label}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {sourcesQuery.isSuccess && count === 0 ? 'No sources tracked' : SCOPE_INFO[s].description}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
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
                              className="w-full"
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

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="sourceId">Emission source</Label>
                      <Controller
                        control={control}
                        name="sourceId"
                        render={({ field, fieldState }) => (
                          <Select value={field.value} onValueChange={chooseSource} disabled={!category}>
                            <SelectTrigger
                              id="sourceId"
                              className="w-full"
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

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="amount">Amount</Label>
                      <Input
                        id="amount"
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        placeholder="0"
                        className="tabular-nums"
                        aria-invalid={Boolean(errors.amount)}
                        aria-describedby={errors.amount ? 'amount-error' : undefined}
                        {...register('amount', { valueAsNumber: true })}
                      />
                      {fieldError(errors.amount?.message, 'amount-error')}
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="unit">Unit</Label>
                      <Controller
                        control={control}
                        name="unit"
                        render={({ field, fieldState }) => (
                          <Select value={field.value} onValueChange={field.onChange} disabled={!source}>
                            <SelectTrigger
                              id="unit"
                              className="w-full"
                              aria-invalid={fieldState.invalid}
                              aria-describedby={fieldState.error ? 'unit-error' : undefined}
                              onBlur={field.onBlur}
                            >
                              <SelectValue placeholder={source ? 'Choose a unit' : 'Choose a source first'} />
                            </SelectTrigger>
                            <SelectContent>
                              {(source?.factors ?? []).map((f) => (
                                <SelectItem key={f.unit} value={f.unit}>
                                  {unitLabel(f.unit)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {fieldError(errors.unit?.message, 'unit-error')}
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="period">Reporting month</Label>
                      <Input
                        id="period"
                        type="month"
                        min={`${ENTRY_LIMITS.firstYear}-01`}
                        max={currentPeriod()}
                        aria-invalid={Boolean(errors.period)}
                        aria-describedby={errors.period ? 'period-error' : undefined}
                        {...register('period')}
                      />
                      {fieldError(errors.period?.message, 'period-error')}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="dataSource">
                      Data source <span className="font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="dataSource"
                      placeholder="e.g. Electricity bill INV-2026-031"
                      aria-invalid={Boolean(errors.dataSource)}
                      {...register('dataSource')}
                    />
                    {fieldError(errors.dataSource?.message)}
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="notes">
                      Notes <span className="font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <Textarea
                      id="notes"
                      rows={3}
                      placeholder="Anything a reviewer should know, e.g. estimated from meter readings"
                      aria-invalid={Boolean(errors.notes)}
                      {...register('notes')}
                    />
                    {fieldError(errors.notes?.message)}
                  </div>

                  {createEntry.isError && (
                    <p role="alert" className="text-sm text-destructive">
                      Couldn&apos;t save the entry: {errorMessage(createEntry.error)}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" className="h-10 rounded-full px-5" disabled={isSubmitting}>
                      {isSubmitting ? 'Adding...' : 'Add entry'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-full px-5"
                      onClick={() => {
                        reset()
                        setLastAdded(null)
                        createEntry.reset()
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Live calculation (stays in view while scrolling the form on large screens) */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          {sourcesQuery.isPending ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : (
            <CalculationCard
              source={source}
              factor={factor}
              amount={amount}
              year={year}
              // While another year's factors load, the previous year's are still on screen: never show those
              loadingYear={sourcesQuery.isPlaceholderData}
            />
          )}
        </aside>
      </div>
    </>
  )
}

function CalculationCard({
  source,
  factor,
  amount,
  year,
  loadingYear,
}: {
  source?: CompanySource
  factor?: CompanySource['factors'][number]
  amount?: number
  year: number
  loadingYear: boolean
}) {
  if (loadingYear) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Calculated emissions</CardTitle>
          <CardDescription>Loading the {year} emission factors...</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }
  const ready = source && factor && typeof amount === 'number' && Number.isFinite(amount) && amount > 0
  const co2eKg = ready ? amount * factor.kgCo2ePerUnit : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calculated emissions</CardTitle>
        <CardDescription>Amount × emission factor</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4" aria-live="polite">
        {ready ? (
          <>
            <p className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold tracking-tight">{formatTonnes(co2eKg, 2)}</span>
              <span className="text-muted-foreground">t CO2e</span>
            </p>
            <dl className="grid gap-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Amount</dt>
                <dd className="text-right tabular-nums">
                  {formatNumber(amount)} {unitLabel(factor.unit)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Factor</dt>
                <dd className="text-right tabular-nums">
                  {formatFactor(factor.kgCo2ePerUnit)} {perUnit(factor.unit)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t pt-1">
                <dt className="text-muted-foreground">Emissions</dt>
                <dd className="text-right font-medium tabular-nums">{formatNumber(co2eKg, 1)} kg CO2e</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Choose an emission source and unit and enter an amount to see the result.
          </p>
        )}
        {factor ? (
          <p className="flex gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {factor.year === year
              ? `UK Government GHG Conversion Factors ${factor.year}.`
              : factor.year < year
                ? `UK Government GHG Conversion Factors ${factor.year} (no ${year} factor for this source yet; the latest earlier one is used).`
                : `UK Government GHG Conversion Factors ${factor.year} (no ${year} factor for this source; the earliest available one is used).`}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
