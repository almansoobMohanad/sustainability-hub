import { useMemo, useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowDownRight, ArrowUpRight, ChartColumn, CirclePlus, Clock, Table2 } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hub/ui/components/card'
import { Label } from '@hub/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hub/ui/components/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hub/ui/components/table'
import { cn } from '@hub/ui/lib/utils'
import { PageHeader } from '@/components/page-header'
import { entriesQuery, sourcesQuery } from '@/features/emissions/queries'
import { StatusBadge } from '@/features/emissions/status-badge'
import { SCOPES, SCOPE_INFO, type Scope } from '@/features/emissions/types'
import { formatNumber, formatPeriod, formatTonnes, monthName } from '@/lib/format'
import { MonthlyScopeChart } from './monthly-scope-chart'
import { availableYears, summarizeYear, type YearSummary } from './summarize'

const scopeColor = (scope: Scope) => `var(--scope-${scope})`

export function DashboardPage() {
  const { data: entries } = useSuspenseQuery(entriesQuery)
  const { data: sources } = useSuspenseQuery(sourcesQuery)

  const years = useMemo(() => availableYears(entries), [entries])
  const [year, setYear] = useState(() => years[0] ?? new Date().getFullYear())
  const summary = useMemo(() => summarizeYear(entries, sources, year), [entries, sources, year])

  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={
          <Button asChild size="sm" className="rounded-full px-3">
            <Link to="/emissions/new">
              <CirclePlus data-icon="inline-start" aria-hidden />
              Add emissions
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-6 p-4 md:p-6">
        {/* Filters: one row above everything they affect */}
        <div className="flex items-center gap-3">
          <Label htmlFor="dashboard-year" className="text-muted-foreground">
            Year
          </Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger id="dashboard-year" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(years.length ? years : [year]).map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {summary.lastMonthWithData < 0 ? (
          <EmptyState year={year} />
        ) : (
          <>
            <TotalsCard summary={summary} />
            <MonthlyCard summary={summary} />
            <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
              <RecentEntriesCard />
              <VerificationCard count={summary.awaitingVerification} year={year} />
            </div>
          </>
        )}
      </div>
    </>
  )
}

/** "Jan–Oct 2026" (or "Jan 2026" for a single month). */
function periodLabel(lastMonth: number, year: number) {
  return lastMonth === 0
    ? `${monthName(0)} ${year}`
    : `${monthName(0)}–${monthName(lastMonth)} ${year}`
}

function TotalsCard({ summary }: { summary: YearSummary }) {
  const { total, byScope, year, lastMonthWithData, previousYearSamePeriod: prev } = summary
  const change = prev.hasData && prev.total > 0 ? (total - prev.total) / prev.total : null
  const decreased = change !== null && change < 0

  return (
    <Card>
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-end">
          {/* The dashboard's one headline number */}
          <div>
            <p className="text-sm text-muted-foreground">
              Total emissions, {periodLabel(lastMonthWithData, year)}
            </p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-5xl font-semibold tracking-tight">{formatTonnes(total)}</span>
              <span className="text-lg text-muted-foreground">t CO2e</span>
            </p>
            {change !== null && (
              <p
                className="mt-2 flex items-center gap-1 text-sm"
                style={{ color: decreased ? 'var(--delta-good)' : 'var(--delta-bad)' }}
              >
                {decreased ? (
                  <ArrowDownRight className="size-4" aria-hidden />
                ) : (
                  <ArrowUpRight className="size-4" aria-hidden />
                )}
                <span className="font-medium">
                  {decreased ? '' : '+'}
                  {(change * 100).toFixed(1)}%
                </span>
                <span className="text-muted-foreground">
                  vs {periodLabel(lastMonthWithData, year - 1)}
                </span>
              </p>
            )}
          </div>

          {/* Per-scope figures; each swatch also serves as the legend for the bar below */}
          <ul className="grid gap-4 sm:grid-cols-3">
            {SCOPES.map((scope) => (
              <li key={scope} className="min-w-0">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ background: scopeColor(scope) }}
                    aria-hidden
                  />
                  {SCOPE_INFO[scope].label}
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {formatTonnes(byScope[scope])}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">t</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {total > 0 ? Math.round((byScope[scope] / total) * 100) : 0}% of total
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* Thin segmented bar: each scope's share of the total */}
        <div
          role="img"
          aria-label={`Share of total: ${SCOPES.map(
            (s) => `${SCOPE_INFO[s].label} ${total > 0 ? Math.round((byScope[s] / total) * 100) : 0}%`,
          ).join(', ')}`}
          className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
        >
          {SCOPES.filter((s) => byScope[s] > 0).map((scope) => (
            <span key={scope} style={{ flexGrow: byScope[scope], background: scopeColor(scope) }} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function MonthlyCard({ summary }: { summary: YearSummary }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const months = summary.months.filter((m) => m.hasData)

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Monthly emissions by scope</CardTitle>
          <CardDescription>Tonnes CO2e per month, {summary.year}</CardDescription>
        </div>
        {/* Chart / table switch: the table is the text alternative to the chart */}
        <div className="flex rounded-full border p-0.5" role="group" aria-label="View">
          {(
            [
              ['chart', 'Chart', ChartColumn],
              ['table', 'Table', Table2],
            ] as const
          ).map(([value, label, Icon]) => (
            <Button
              key={value}
              size="sm"
              variant={view === value ? 'secondary' : 'ghost'}
              className="h-7 rounded-full px-3"
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              <Icon data-icon="inline-start" aria-hidden />
              {label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {view === 'chart' ? (
          <>
            {/* Legend: always present for the three series */}
            <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              {SCOPES.map((scope) => (
                <li key={scope} className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-sm"
                    style={{ background: scopeColor(scope) }}
                    aria-hidden
                  />
                  {SCOPE_INFO[scope].label}
                  <span className="hidden text-xs md:inline">· {SCOPE_INFO[scope].description}</span>
                </li>
              ))}
            </ul>
            <MonthlyScopeChart months={summary.months} year={summary.year} />
          </>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                {SCOPES.map((s) => (
                  <TableHead key={s} className="text-right">
                    {SCOPE_INFO[s].label}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="tabular-nums">
              {months.map((m) => (
                <TableRow key={m.month}>
                  <TableCell>
                    {monthName(m.month)} {summary.year}
                  </TableCell>
                  {SCOPES.map((s) => (
                    <TableCell key={s} className="text-right">
                      {formatTonnes(m.byScope[s])}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-medium">{formatTonnes(m.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function RecentEntriesCard() {
  const { data: entries } = useSuspenseQuery(entriesQuery)
  const { data: sources } = useSuspenseQuery(sourcesQuery)
  const sourceById = new Map(sources.map((s) => [s.id, s]))
  const recent = [...entries]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6)

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Recent entries</CardTitle>
        <CardDescription>The latest activity data added</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Activity</TableHead>
              <TableHead className="text-right">t CO2e</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.map((entry) => {
              const source = sourceById.get(entry.sourceId)
              return (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap">{formatPeriod(entry.period)}</TableCell>
                  <TableCell className="max-w-56">
                    <span className="block truncate">{source?.name ?? 'Unknown source'}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {source ? `${SCOPE_INFO[source.scope].label} · ${source.category}` : ''}
                    </span>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatNumber(entry.amount)} {source?.unit}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatTonnes(entry.co2eKg, 2)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={entry.status} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function VerificationCard({ count, year }: { count: number; year: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Awaiting verification</CardTitle>
        <CardDescription>Entries in {year} a manager still needs to review</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="flex items-center gap-2">
          <Clock className="size-5 text-muted-foreground" aria-hidden />
          <span className="text-3xl font-semibold tracking-tight">{count}</span>
          <span className="text-muted-foreground">{count === 1 ? 'entry' : 'entries'}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          The verification workflow (approve, reject, audit trail) comes in a later step.
        </p>
      </CardContent>
    </Card>
  )
}

function EmptyState({ year }: { year: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-lg font-medium">No emissions recorded for {year}</p>
        <p className={cn('max-w-sm text-sm text-muted-foreground')}>
          Add your first activity data, such as fuel, electricity or business travel, to see your
          footprint here.
        </p>
        <Button asChild className="mt-2 rounded-full px-5">
          <Link to="/emissions/new">Add emissions</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
