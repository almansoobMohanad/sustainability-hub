import { useEffect, useMemo, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CircleCheck, Info } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@hub/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hub/ui/components/card'
import { Input } from '@hub/ui/components/input'
import { Label } from '@hub/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hub/ui/components/select'
import { Textarea } from '@hub/ui/components/textarea'
import { PageHeader } from '@/components/page-header'
import { currentPeriod, formatNumber, formatPeriod, formatTonnes } from '@/lib/format'
import { sourcesQuery, useCreateEntry } from './queries'
import { SCOPES, SCOPE_INFO, type EmissionEntry, type EmissionSource } from './types'

/* ------------------------------------------------------------------------ */
/* Validation rules (also the form's data shape)                             */
/* ------------------------------------------------------------------------ */

const schema = z.object({
  scope: z.enum(['1', '2', '3']),
  category: z.string().min(1, 'Choose a category'),
  sourceId: z.string().min(1, 'Choose an emission source'),
  amount: z
    .number({ error: 'Enter an amount' })
    .positive('Enter an amount greater than 0')
    .max(1e12, 'That amount looks too large'),
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Choose a reporting month')
    .refine((p) => p <= currentPeriod(), "The reporting month can't be in the future"),
  dataSource: z.string().trim().max(200, 'Keep this under 200 characters'),
  notes: z.string().trim().max(1000, 'Keep notes under 1,000 characters'),
})

type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

const scopeColor = (scope: string) => `var(--scope-${scope})`

/* ------------------------------------------------------------------------ */

export function AddEmissionPage() {
  const { data: sources } = useSuspenseQuery(sourcesQuery)
  const createEntry = useCreateEntry()
  const [lastAdded, setLastAdded] = useState<{ entry: EmissionEntry; source: EmissionSource } | null>(null)
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
      amount: undefined,
      period: currentPeriod(),
      dataSource: '',
      notes: '',
    },
  })

  const [scope, category, sourceId, amount] = useWatch({
    control,
    name: ['scope', 'category', 'sourceId', 'amount'],
  })

  // Options narrow down: scope -> categories -> sources
  const categories = useMemo(
    () => [...new Set(sources.filter((s) => String(s.scope) === scope).map((s) => s.category))],
    [sources, scope],
  )
  const sourcesInCategory = (cat: string) =>
    sources.filter((s) => String(s.scope) === scope && s.category === cat)
  const source = sources.find((s) => s.id === sourceId)

  const onSubmit = async (values: FormOutput) => {
    const entry = await createEntry.mutateAsync({
      sourceId: values.sourceId,
      period: values.period,
      amount: values.amount,
      dataSource: values.dataSource || undefined,
      notes: values.notes || undefined,
    })
    setLastAdded({ entry, source: sources.find((s) => s.id === entry.sourceId)! })
    // Keep the choices (handy for adding several similar entries), clear the rest.
    // The amount is reset to '' (not undefined): React Hook Form ignores undefined
    // and would leave the old number in the input. An empty amount fails
    // validation with "Enter an amount", as it should.
    reset({ ...values, amount: '' as unknown as number, dataSource: '', notes: '' })
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
              <CircleCheck className="size-5 shrink-0 text-[#0ca30c]" aria-hidden />
              <p className="flex-1 text-sm">
                <span className="font-medium">Entry added: </span>
                {formatNumber(lastAdded.entry.amount)} {lastAdded.source.unit} of{' '}
                {lastAdded.source.name.toLowerCase()} for {formatPeriod(lastAdded.entry.period, 'long')}{' '}
                = <span className="font-medium">{formatTonnes(lastAdded.entry.co2eKg, 2)} t CO2e</span>.
                It is marked unverified until a manager reviews it.
              </p>
              <Button asChild size="sm" variant="outline" className="rounded-full px-3">
                <Link to="/">View dashboard</Link>
              </Button>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Activity details</CardTitle>
              <CardDescription>
                Record one activity, such as fuel used, electricity bought or distance travelled.
                Emissions are calculated from the matching emission factor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
                {/* Scope: three selectable cards (native radio buttons, keyboard friendly) */}
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-medium">Scope</legend>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {SCOPES.map((s) => (
                      <label
                        key={s}
                        className="flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors hover:bg-muted/50 has-checked:border-emerald-600 has-checked:bg-emerald-50/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50 dark:has-checked:bg-emerald-950/30"
                      >
                        <input
                          type="radio"
                          value={String(s)}
                          className="sr-only"
                          {...register('scope', {
                            onChange: () => {
                              // A different scope means different categories and sources
                              setValue('category', '')
                              setValue('sourceId', '')
                            },
                          })}
                        />
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <span
                            className="size-2.5 rounded-sm"
                            style={{ background: scopeColor(String(s)) }}
                            aria-hidden
                          />
                          {SCOPE_INFO[s].label}
                        </span>
                        <span className="text-xs text-muted-foreground">{SCOPE_INFO[s].description}</span>
                      </label>
                    ))}
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
                            setValue('sourceId', options.length === 1 ? options[0].id : '', {
                              shouldValidate: options.length === 1,
                            })
                          }}
                        >
                          <SelectTrigger
                            id="category"
                            className="w-full"
                            aria-invalid={fieldState.invalid}
                            aria-describedby={fieldState.error ? 'category-error' : undefined}
                            onBlur={field.onBlur}
                          >
                            <SelectValue placeholder="Choose a category" />
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
                        <Select value={field.value} onValueChange={field.onChange} disabled={!category}>
                          <SelectTrigger
                            id="sourceId"
                            className="w-full"
                            aria-invalid={fieldState.invalid}
                            aria-describedby={fieldState.error ? 'source-error' : undefined}
                            onBlur={field.onBlur}
                          >
                            <SelectValue
                              placeholder={category ? 'Choose a source' : 'Choose a category first'}
                            />
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="amount">Amount</Label>
                    <div className="relative">
                      <Input
                        id="amount"
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        placeholder="0"
                        className="pr-28 tabular-nums"
                        aria-invalid={Boolean(errors.amount)}
                        aria-describedby={errors.amount ? 'amount-error' : 'amount-unit'}
                        {...register('amount', { valueAsNumber: true })}
                      />
                      <span
                        id="amount-unit"
                        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
                      >
                        {source?.unit ?? 'unit'}
                      </span>
                    </div>
                    {fieldError(errors.amount?.message, 'amount-error')}
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="period">Reporting month</Label>
                    <Input
                      id="period"
                      type="month"
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
                    Couldn&apos;t save the entry: {createEntry.error.message}. Please try again.
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
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Live calculation (stays in view while scrolling the form on large screens) */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <CalculationCard source={source} amount={amount} />
        </aside>
      </div>
    </>
  )
}

function CalculationCard({ source, amount }: { source?: EmissionSource; amount?: number }) {
  const ready = source && typeof amount === 'number' && Number.isFinite(amount) && amount > 0
  const co2eKg = ready ? amount * source.factorKgPerUnit : 0

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
                  {formatNumber(amount)} {source.unit}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Factor</dt>
                <dd className="text-right tabular-nums">
                  {formatNumber(source.factorKgPerUnit, 3)} kg/{source.unit}
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
            Choose an emission source and enter an amount to see the result.
          </p>
        )}
        {source && (
          <p className="flex gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {source.reference}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
