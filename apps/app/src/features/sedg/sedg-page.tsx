import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { CircleCheck, Download, ExternalLink, LoaderCircle } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hub/ui/components/select'
import { Skeleton } from '@hub/ui/components/skeleton'
import { toast } from '@hub/ui/components/sonner'
import { cn } from '@hub/ui/lib/utils'
import { can } from '@hub/shared/permissions'
import {
  SEDG_GENERAL_FIELDS,
  SEDG_LEVELS,
  SEDG_LEVEL_LABELS,
  SEDG_PILLARS,
  SEDG_PILLAR_LABELS,
  disclosuresFor,
  isDisclosureComplete,
  type SedgDisclosure,
  type SedgLevel,
  type SedgPillar,
  type SedgValue,
} from '@hub/shared/sedg'
import { InfoTip } from '@/components/info-tip'
import { PageHeader } from '@/components/page-header'
import { PageBody, PageTitle } from '@/components/page-layout'
import { useMe } from '@/features/company/me'
import { HistorySheet } from '@/features/reports/history-sheet'
import { SaveLine } from '@/features/reports/save-line'
import { useAutosave, type Autosave, type ReportChanges } from '@/features/reports/use-autosave'
import { errorMessage } from '@/lib/api'
import {
  applyChanges,
  refreshFigures,
  saveSedgChanges,
  sedgHistoryQueryOptions,
  sedgReportQueryOptions,
  type SedgChanges,
  type SedgReport,
  type SedgSaved,
} from './queries'
import { downloadSedgPdf, shownValue } from './report-values'
import { SedgFieldInput } from './sedg-field'
import { SEDG_COLORS } from './style'

/*
  The SEDG disclosure (Admins and Managers): one report per calendar year.
  Layout (AGENTS.md "UI design"): left-aligned, flat sections, no cards. A
  jump list on the left (large screens) shows how complete each pillar is.
  Every disclosure is a row: code, level and (i) on the left, fields on the
  right. Changes save themselves (reports/use-autosave.ts); the line under the title
  says when, and by whom, the report was last edited. "Download PDF" builds
  the PDF in the browser.
*/

const OFFICIAL_GUIDE = 'https://sedg.capitalmarketsmalaysia.com/'
// Saving these changes another figure (the intensity, E1.7)
const FIGURE_INPUTS = new Set(['gen_revenue', 'e1_1', 'e1_2'])

export function SedgPage({ year }: { year: number }) {
  const { company } = useMe()
  const report = useQuery(sedgReportQueryOptions(company!.id, year))

  return (
    <>
      <PageHeader title="SEDG disclosure" />
      <PageBody className="max-w-6xl">
        {report.isPending ? (
          <div className="flex flex-col gap-4" aria-label="Loading the report">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-10 w-full max-w-xl" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : report.isError ? (
          <p className="text-sm text-destructive">{errorMessage(report.error)}</p>
        ) : (
          <ReportForm report={report.data} companyId={company!.id} />
        )}
      </PageBody>
    </>
  )
}

function ReportForm({ report, companyId }: { report: SedgReport; companyId: string }) {
  const { role } = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const year = report.year
  const save = useCallback(
    (changes: ReportChanges<SedgValue>, options?: { keepalive?: boolean }) =>
      saveSedgChanges(year, changes as SedgChanges, options),
    [year],
  )
  const apply = useCallback(
    (changes: ReportChanges<SedgValue>, saved?: SedgSaved) => {
      applyChanges(queryClient, companyId, year, changes as SedgChanges, saved)
      // The intensity (E1.7) is worked out from these: fetch the figures again
      if (saved && Object.keys(changes.answers ?? {}).some((key) => FIGURE_INPUTS.has(key))) {
        void refreshFigures(queryClient, companyId, year)
      }
    },
    [companyId, queryClient, year],
  )
  const autosave = useAutosave<SedgValue, SedgSaved>({ save, apply })
  const [downloading, setDownloading] = useState(false)
  const disclosures = disclosuresFor(report.level)
  const hasValue = (field: SedgDisclosure['fields'][number]) => shownValue(report, field) !== undefined

  async function download() {
    setDownloading(true)
    try {
      await autosave.flush() // the PDF shows what's on screen, including the last few seconds of typing
      const latest = queryClient.getQueryData(sedgReportQueryOptions(companyId, report.year).queryKey) ?? report
      await downloadSedgPdf(latest)
    } catch (error) {
      toast.error("Couldn't create the PDF", { description: error instanceof Error ? error.message : undefined })
    } finally {
      setDownloading(false)
    }
  }

  const pillarProgress = (pillar: SedgPillar) => {
    const items = disclosures.filter((disclosure) => disclosure.pillar === pillar)
    return { done: items.filter((disclosure) => isDisclosureComplete(disclosure, hasValue)).length, total: items.length }
  }
  const generalDone = SEDG_GENERAL_FIELDS.filter((field) => !field.optional && hasValue(field)).length
  const generalTotal = SEDG_GENERAL_FIELDS.filter((field) => !field.optional).length

  return (
    <>
      <PageTitle
        title="SEDG disclosure"
        info="Capital Markets Malaysia's Simplified ESG Disclosure Guide (version 2): a short ESG report for customers, banks and investors. Choose a level, fill in its disclosures (figures from your verified entries are calculated for you) and download the PDF. Changes save automatically; Members can't see this report."
        actions={
          <>
            <Button asChild variant="ghost" size="sm" className="h-10 rounded-full">
              <a href={OFFICIAL_GUIDE} target="_blank" rel="noreferrer">
                Official guide
                <ExternalLink aria-hidden />
              </a>
            </Button>
            <Select
              value={String(report.year)}
              onValueChange={(value) => void navigate({ to: '/reports/sedg', search: { year: Number(value) } })}
            >
              <SelectTrigger aria-label="Year" className="rounded-full data-[size=default]:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {report.years.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="h-10 rounded-full px-5" onClick={download} disabled={downloading}>
              {downloading ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Download aria-hidden />}
              {downloading ? 'Preparing PDF...' : 'Download PDF'}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <LevelControl level={report.level} onChange={(level) => autosave.changeSetting('level', level)} />
        <SaveLine
          status={autosave.status}
          updatedAt={report.updatedAt}
          updatedBy={report.updatedBy}
          onRetry={() => void autosave.flush()}
        />
        <HistorySheet
          title={`the ${report.year} report`}
          query={sedgHistoryQueryOptions(companyId, report.year)}
          partLabel={(part) => (part === 'Level' ? 'Report level' : part === 'General' ? 'General information' : part)}
        />
      </div>

      <BaselineLine report={report} canSet={can(role, 'organization', 'update')} />

      <div className="grid gap-10 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <nav aria-label="Report sections" className="hidden lg:block">
          <ul className="sticky top-20 flex flex-col gap-1 text-sm">
            <JumpLink href="#sedg-general" label="General information" done={generalDone} total={generalTotal} />
            {SEDG_PILLARS.map((pillar) => (
              <JumpLink key={pillar} href={`#sedg-${pillar}`} label={SEDG_PILLAR_LABELS[pillar]} {...pillarProgress(pillar)} />
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-10">
          <section id="sedg-general" aria-labelledby="sedg-general-title" className="scroll-mt-20">
            <SectionHeading id="sedg-general-title" title="General information" done={generalDone} total={generalTotal} />
            <div className="grid gap-x-6 gap-y-5 border-t pt-6 sm:grid-cols-2">
              {SEDG_GENERAL_FIELDS.map((field) => (
                <SedgFieldInput
                  key={field.key}
                  field={field}
                  stored={report.answers[field.key]}
                  figure={field.auto ? report.automatic[field.auto] : undefined}
                  onChange={autosave.change}
                  onDiscard={autosave.discard}
                  onBlur={() => void autosave.flush()}
                />
              ))}
            </div>
          </section>

          {SEDG_PILLARS.map((pillar) => (
            <section key={pillar} id={`sedg-${pillar}`} aria-labelledby={`sedg-${pillar}-title`} className="scroll-mt-20">
              <SectionHeading id={`sedg-${pillar}-title`} title={SEDG_PILLAR_LABELS[pillar]} {...pillarProgress(pillar)} />
              <div className="divide-y border-t">
                {disclosures
                  .filter((disclosure) => disclosure.pillar === pillar)
                  .map((disclosure) => (
                    <DisclosureRow
                      key={disclosure.code}
                      disclosure={disclosure}
                      report={report}
                      complete={isDisclosureComplete(disclosure, hasValue)}
                      autosave={autosave}
                    />
                  ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}

/** Basic / Intermediate / Advanced: a segmented control (native radio buttons, keyboard friendly) */
function LevelControl({ level, onChange }: { level: SedgLevel; onChange: (level: SedgLevel) => void }) {
  return (
    <fieldset className="flex min-w-0 items-center gap-2">
      <legend className="sr-only">Report level</legend>
      <div className="flex rounded-full bg-muted p-1">
        {SEDG_LEVELS.map((option) => (
          <label
            key={option}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow] hover:text-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50 motion-reduce:transition-none"
          >
            <input
              type="radio"
              name="sedg-level"
              value={option}
              className="sr-only"
              checked={level === option}
              onChange={() => onChange(option)}
            />
            {SEDG_LEVEL_LABELS[option]}
            <span className="hidden text-xs font-normal text-muted-foreground tabular-nums sm:inline">
              {disclosuresFor(option).length}
            </span>
          </label>
        ))}
      </div>
      <InfoTip label="About levels">
        Basic covers the essentials. Intermediate adds reductions and breakdowns; Advanced adds Scope 3, intensity and risk
        disclosures (all 38). Each level includes the ones before it. Values of a higher level are kept if you go back to a
        lower one, but they aren&apos;t in the PDF.
      </InfoTip>
    </fieldset>
  )
}

/** The year reductions are measured against (a company setting, set by Admins) */
function BaselineLine({ report, canSet }: { report: SedgReport; canSet: boolean }) {
  if (report.level === 'basic') return null // Basic has no reductions
  const settingsLink = (text: string) =>
    canSet ? (
      <Link to="/settings/company" hash="settings-baseline" className="font-medium text-foreground underline-offset-4 hover:underline">
        {text}
      </Link>
    ) : null
  if (report.baselineYear === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Reductions need a baseline year. {canSet ? settingsLink('Set the baseline year') : 'An Admin can set it in Company settings.'}
      </p>
    )
  }
  return (
    <p className="text-sm text-muted-foreground">
      Reductions are compared with the baseline year {report.baselineYear}.{' '}
      {report.baselineYear >= report.year ? 'Choose a later report year to see them. ' : null}
      {settingsLink('Change')}
    </p>
  )
}

function JumpLink({ href, label, done, total }: { href: string; label: string; done: number; total: number }) {
  const complete = total > 0 && done === total
  return (
    <li>
      <a href={href} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 hover:bg-muted">
        <span className="font-medium">{label}</span>
        <span className={cn('flex items-center gap-1 text-xs tabular-nums', complete ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
          {complete ? <CircleCheck className="size-3.5" aria-hidden /> : null}
          {done}/{total}
          <span className="sr-only"> complete</span>
        </span>
      </a>
    </li>
  )
}

function SectionHeading({ id, title, done, total }: { id: string; title: string; done: number; total: number }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h3 id={id} className="text-lg font-semibold tracking-tight">
        {title}
      </h3>
      <span className="text-sm text-muted-foreground tabular-nums">
        {done} of {total} complete
      </span>
    </div>
  )
}

function DisclosureRow({
  disclosure,
  report,
  complete,
  autosave,
}: {
  disclosure: SedgDisclosure
  report: SedgReport
  complete: boolean
  autosave: Autosave<SedgValue>
}) {
  const titleId = `sedg-${disclosure.code}`
  return (
    <section aria-labelledby={titleId} className="grid gap-x-10 gap-y-4 py-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-1.5 self-start">
        <span className="flex items-center gap-2">
          <h4 id={titleId} className="text-sm font-semibold tabular-nums">
            {disclosure.code}
          </h4>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
            {/* The level's colour from the official template, as a mark (text keeps its normal colour) */}
            <span className="size-2 rounded-full" style={{ background: SEDG_COLORS[disclosure.pillar][disclosure.level] }} aria-hidden />
            {SEDG_LEVEL_LABELS[disclosure.level]}
          </span>
          {complete ? (
            <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-label="Complete" />
          ) : null}
          <InfoTip label={`About ${disclosure.code}`}>{disclosure.info}</InfoTip>
        </span>
        <span className="text-sm text-muted-foreground">
          {disclosure.topic} · {disclosure.title}
        </span>
      </div>
      <div className="grid min-w-0 gap-x-6 gap-y-5 sm:grid-cols-2">
        {disclosure.fields.map((field) => (
          <SedgFieldInput
            key={field.key}
            field={field}
            stored={report.answers[field.key]}
            figure={field.auto ? report.automatic[field.auto] : undefined}
            onChange={autosave.change}
            onDiscard={autosave.discard}
            onBlur={() => void autosave.flush()}
          />
        ))}
      </div>
    </section>
  )
}
