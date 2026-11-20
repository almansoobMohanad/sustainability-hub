import { useState, type ReactNode } from 'react'
import { Check, CircleX, FileSpreadsheet, TriangleAlert } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hub/ui/components/table'
import { cn } from '@hub/ui/lib/utils'
import { IMPORT_COLUMN_LABELS, type ImportRowInput } from '@hub/shared/imports'
import { InfoTip } from '@/components/info-tip'
import { SCOPE_INFO } from '@/features/emissions/types'
import { unitLabel } from '@/features/factors/format'
import { formatNumber, formatPeriod, formatTonnes } from '@/lib/format'
import { checkCounts, rowsText, type RowsView } from './import-counts'
import type { CheckedRow } from './queries'
import type { ImportFile } from './spreadsheet'

/*
  The check result of a file: a summary line, tabs (all / problems / warnings)
  and the rows, each with what will be saved or its problems (row + column).
*/

/** The file and its result in one line */
export function PreviewSummary({ file, rows }: { file: ImportFile; rows: CheckedRow[] }) {
  const counts = checkCounts(rows)
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{file.fileName}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {rowsText(rows.length)}
            {file.unfilledRows > 0 ? (
              <>
                {` · ${formatNumber(file.unfilledRows)} without an amount left out`}
                <InfoTip label="About rows without an amount">
                  Rows with no amount (and no data source or notes) count as not filled in, like the template&apos;s
                  sources you didn&apos;t use. They are not imported.
                </InfoTip>
              </>
            ) : null}
            {file.ignoredHeaders.length > 0 ? ` · ignored columns: ${file.ignoredHeaders.join(', ')}` : null}
          </p>
        </div>
      </div>
      <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <Stat icon={<Check className="size-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} aria-hidden />} label="ready" value={counts.ready} />
        {counts.problems > 0 ? (
          <Stat icon={<CircleX className="size-4 text-red-600 dark:text-red-400" aria-hidden />} label="with problems" value={counts.problems} />
        ) : null}
        {counts.warnings > 0 ? (
          <Stat
            icon={<TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />}
            label={counts.warnings === 1 ? 'warning' : 'warnings'}
            value={counts.warnings}
          />
        ) : null}
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">Emissions of the ready rows</dt>
          <dd className="font-semibold tabular-nums">{formatTonnes(counts.totalKg, 2)}</dd>
          <span className="text-muted-foreground">t CO2e</span>
        </div>
      </dl>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <dd className="font-semibold tabular-nums">{formatNumber(value)}</dd>
      <dt className="text-muted-foreground">{label}</dt>
    </div>
  )
}

const PAGE = 100

/** Tabs + rows; opens on "Problems" when there are any */
export function CheckedRows({ file, rows }: { file: ImportFile; rows: CheckedRow[] }) {
  const [view, setView] = useState<RowsView>(() => (rows.some((row) => row.problems.length > 0) ? 'problems' : 'all'))
  const [shown, setShown] = useState(PAGE)
  const inputs = new Map(file.rows.map((row) => [row.row, row]))
  const withProblems = rows.filter((row) => row.problems.length > 0)
  const withWarnings = rows.filter((row) => row.warnings.length > 0)
  const listed = view === 'problems' ? withProblems : view === 'warnings' ? withWarnings : rows

  return (
    <div className="flex flex-col gap-3">
      <ViewTabs
        value={view}
        onChange={(next) => {
          setView(next)
          setShown(PAGE)
        }}
        options={[
          { value: 'all', label: 'All rows', count: rows.length },
          { value: 'problems', label: 'Problems', count: withProblems.length, tone: 'problem' },
          { value: 'warnings', label: 'Warnings', count: withWarnings.length, tone: 'warning' },
        ]}
      />
      <div className="overflow-hidden rounded-xl border">
        {listed.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {view === 'problems' ? 'No problems: every row can be imported.' : 'No warnings.'}
          </p>
        ) : (
          <>
            {/* Phones: stacked rows */}
            <ul className="divide-y md:hidden">
              {listed.slice(0, shown).map((row) => (
                <li key={row.row} className="flex gap-3 px-4 py-3">
                  <RowIcon row={row} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Row {row.row}</p>
                    <RowSummary row={row} input={inputs.get(row.row)} />
                    <RowNotes row={row} />
                  </div>
                </li>
              ))}
            </ul>

            <Table className="hidden md:table">
              <TableHeader className="bg-muted/40 [&_th]:h-10 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-14 pl-4">Row</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Activity</TableHead>
                  <TableHead className="text-right">t CO2e</TableHead>
                  <TableHead className="w-[34%] pr-4">Check</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listed.slice(0, shown).map((row) => {
                  const input = inputs.get(row.row)
                  return (
                    <TableRow key={row.row} className="align-top">
                      <TableCell className="pl-4 text-muted-foreground tabular-nums">{row.row}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.entry ? formatPeriod(row.entry.period) : <Raw value={input?.month} />}
                      </TableCell>
                      <TableCell className="max-w-64">
                        {row.entry ? (
                          <>
                            <span className="block truncate font-medium">{row.entry.source.name}</span>
                            <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                              <span className="size-1.5 shrink-0 rounded-full" style={{ background: `var(--scope-${row.entry.scope})` }} aria-hidden />
                              {SCOPE_INFO[row.entry.scope].label} · {row.entry.source.category}
                            </span>
                          </>
                        ) : (
                          <span className="block truncate">
                            <Raw value={input?.source} />
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {row.entry ? (
                          `${formatNumber(row.entry.amount)} ${unitLabel(row.entry.unit)}`
                        ) : (
                          <>
                            <Raw value={input?.amount} /> <Raw value={input?.unit} empty="" />
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {row.entry ? formatTonnes(row.entry.co2eKg, 2) : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="pr-4 whitespace-normal">
                        <div className="flex gap-2">
                          <RowIcon row={row} />
                          <RowNotes row={row} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </>
        )}
        {listed.length > shown ? (
          <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              Showing {formatNumber(shown)} of {formatNumber(listed.length)}
            </span>
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => setShown(shown + PAGE)}>
              Show more
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** A value as it was in the file (rows with problems show what was read) */
function Raw({ value, empty = 'empty' }: { value: ImportRowInput[keyof ImportRowInput] | undefined; empty?: string }) {
  if (value === undefined || value === null || value === '') {
    return empty ? <span className="text-muted-foreground italic">{empty}</span> : null
  }
  return <>{typeof value === 'number' ? formatNumber(value, 6) : value}</>
}

function RowIcon({ row }: { row: CheckedRow }) {
  if (row.problems.length > 0) return <CircleX className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" aria-label="Problem" />
  if (row.warnings.length > 0) return <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-label="Warning" />
  return <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} aria-label="Ready" />
}

/** Problems (with the column) and warnings of a row; "Ready" when there are none */
function RowNotes({ row }: { row: CheckedRow }) {
  if (row.problems.length === 0 && row.warnings.length === 0) {
    const fallback = row.entry && row.entry.factorYear !== Number(row.entry.period.slice(0, 4))
    return (
      <span className="text-sm text-muted-foreground">
        Ready{fallback ? ` (uses the ${row.entry!.factorYear} factor)` : null}
      </span>
    )
  }
  return (
    <ul className="flex min-w-0 flex-col gap-1 text-sm">
      {row.problems.map((note, index) => (
        <li key={`p${index}`} className="text-red-700 dark:text-red-300">
          {note.column ? <span className="font-medium">{IMPORT_COLUMN_LABELS[note.column]}: </span> : null}
          {note.message}
        </li>
      ))}
      {row.warnings.map((note, index) => (
        <li key={`w${index}`} className="text-amber-800 dark:text-amber-200">
          {note.message}
        </li>
      ))}
    </ul>
  )
}

/** Phones: the row's values on two lines */
function RowSummary({ row, input }: { row: CheckedRow; input: ImportRowInput | undefined }) {
  if (row.entry) {
    return (
      <>
        <p className="font-medium [overflow-wrap:anywhere]">{row.entry.source.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatPeriod(row.entry.period)} · {formatNumber(row.entry.amount)} {unitLabel(row.entry.unit)} ·{' '}
          <span className="font-medium text-foreground tabular-nums">{formatTonnes(row.entry.co2eKg, 2)} t</span>
        </p>
      </>
    )
  }
  return (
    <>
      <p className="font-medium [overflow-wrap:anywhere]">
        <Raw value={input?.source} />
      </p>
      <p className="text-xs text-muted-foreground">
        <Raw value={input?.month} /> · <Raw value={input?.amount} /> <Raw value={input?.unit} empty="" />
      </p>
    </>
  )
}

/** Segmented tabs with counts (radio buttons), like the Entries status tabs */
function ViewTabs({
  value,
  options,
  onChange,
}: {
  value: RowsView
  options: { value: RowsView; label: string; count: number; tone?: 'problem' | 'warning' }[]
  onChange: (view: RowsView) => void
}) {
  return (
    <fieldset className="flex min-w-0 max-w-full self-start overflow-x-auto rounded-full bg-muted p-1">
      <legend className="sr-only">Rows to show</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] hover:text-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50 motion-reduce:transition-none"
        >
          <input type="radio" name="import-rows" className="sr-only" checked={value === option.value} onChange={() => onChange(option.value)} />
          {option.label}
          <span
            className={cn(
              'min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums',
              option.count > 0 && option.tone === 'problem'
                ? 'bg-red-100 text-red-900 dark:bg-red-900/60 dark:text-red-100'
                : option.count > 0 && option.tone === 'warning'
                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100'
                  : 'text-muted-foreground',
            )}
          >
            {formatNumber(option.count)}
          </span>
        </label>
      ))}
    </fieldset>
  )
}
