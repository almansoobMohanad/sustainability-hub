import { useCallback, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CircleCheck, Download, ExternalLink, LoaderCircle } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hub/ui/components/select'
import { Skeleton } from '@hub/ui/components/skeleton'
import { toast } from '@hub/ui/components/sonner'
import { cn } from '@hub/ui/lib/utils'
import { ESG_SECTIONS, ESG_SECTION_TITLES, esgScore, type EsgAnswers, type EsgSection, type EsgValue } from '@hub/shared/esg-ready'
import { PageHeader } from '@/components/page-header'
import { PageBody, PageTitle } from '@/components/page-layout'
import { useMe } from '@/features/company/me'
import { HistorySheet } from '@/features/reports/history-sheet'
import { SaveLine } from '@/features/reports/save-line'
import { useAutosave, type ReportChanges } from '@/features/reports/use-autosave'
import { errorMessage } from '@/lib/api'
import { EsgQuestion } from './esg-question'
import {
  applyEsgReadyChanges,
  esgReadyHistoryQueryOptions,
  esgReadyQueryOptions,
  saveEsgReadyChanges,
  type EsgReadyReport,
  type EsgReadySaved,
} from './queries'
import { downloadEsgReadyPdf, progress } from './report-values'
import { ScoreSummary } from './score-summary'

/*
  ESG Ready, MITI's ESG readiness self-assessment (Admins and Managers), one
  per calendar year. Same layout and behaviour as the SEDG page: left-aligned,
  a jump list with progress per section, answers saved automatically, a
  history, and a PDF. The readiness score at the top follows the answers as
  people click (worked out by @hub/shared/esg-ready, nothing stored).
*/

const MITI_PAGE = 'https://www.miti.gov.my/index.php/pages/view/9849'

export function EsgReadyPage({ year }: { year: number }) {
  const { company } = useMe()
  const report = useQuery(esgReadyQueryOptions(company!.id, year))

  return (
    <>
      <PageHeader title="ESG Ready" />
      <PageBody className="max-w-6xl">
        {report.isPending ? (
          <div className="flex flex-col gap-4" aria-label="Loading the self-assessment">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : report.isError ? (
          <p className="text-sm text-destructive">{errorMessage(report.error)}</p>
        ) : (
          <Questionnaire report={report.data} companyId={company!.id} />
        )}
      </PageBody>
    </>
  )
}

function Questionnaire({ report, companyId }: { report: EsgReadyReport; companyId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const year = report.year
  // The answers on screen: the score and progress follow every click, the autosave catches up
  const [answers, setAnswers] = useState<Partial<EsgAnswers>>(report.answers)
  const [downloading, setDownloading] = useState(false)

  const save = useCallback(
    (changes: ReportChanges<EsgValue>, options?: { keepalive?: boolean }) => saveEsgReadyChanges(year, changes, options),
    [year],
  )
  const apply = useCallback(
    (changes: ReportChanges<EsgValue>, saved?: EsgReadySaved) =>
      applyEsgReadyChanges(queryClient, companyId, year, changes, saved),
    [companyId, queryClient, year],
  )
  const autosave = useAutosave<EsgValue, EsgReadySaved>({ save, apply })

  const change = useCallback(
    (key: string, value: EsgValue | null) => {
      setAnswers((current) => {
        const next = { ...current }
        if (value === null) delete next[key]
        else next[key] = value
        return next
      })
      autosave.change(key, value)
    },
    [autosave],
  )

  const score = useMemo(() => esgScore(answers), [answers])
  const { asked, answered } = useMemo(() => progress(answers, report.automatic), [answers, report.automatic])
  const sectionProgress = (section: EsgSection) => {
    const questions = asked.filter((question) => question.section === section)
    return { done: questions.filter((question) => answered.has(question.number)).length, total: questions.length }
  }

  async function download() {
    setDownloading(true)
    try {
      await autosave.flush() // saved first, so the PDF and the stored answers agree
      await downloadEsgReadyPdf(report, answers)
    } catch (error) {
      toast.error("Couldn't create the PDF", { description: error instanceof Error ? error.message : undefined })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <PageTitle
        title="ESG Ready"
        info="MITI's ESG readiness self-assessment (i-ESGReady): 42 questions about your company and how far its ESG practices have come. Pick the statement that fits best; the readiness score follows your answers. One per year, saved automatically; Members can't see it."
        actions={
          <>
            <Button asChild variant="ghost" size="sm" className="h-10 rounded-full">
              <a href={MITI_PAGE} target="_blank" rel="noreferrer">
                MITI i-ESG
                <ExternalLink aria-hidden />
              </a>
            </Button>
            <Select value={String(year)} onValueChange={(value) => void navigate({ to: '/reports/esg-ready', search: { year: Number(value) } })}>
              <SelectTrigger aria-label="Year" className="rounded-full data-[size=default]:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {report.years.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
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
        <SaveLine status={autosave.status} updatedAt={report.updatedAt} updatedBy={report.updatedBy} onRetry={() => void autosave.flush()} />
        <HistorySheet
          title={`the ${year} self-assessment`}
          query={esgReadyHistoryQueryOptions(companyId, year)}
          partLabel={(part) => part}
        />
      </div>

      <ScoreSummary score={score} answered={answered.size} asked={asked.length} />

      <div className="grid gap-10 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <nav aria-label="Questionnaire sections" className="hidden lg:block">
          <ul className="sticky top-20 flex flex-col gap-1 text-sm">
            {ESG_SECTIONS.map((section) => (
              <JumpLink key={section} section={section} {...sectionProgress(section)} />
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-10">
          {ESG_SECTIONS.map((section) => {
            const { done, total } = sectionProgress(section)
            const scored = section === 'A' ? null : score.sections[section]
            return (
              <section key={section} id={`esg-${section}`} aria-labelledby={`esg-${section}-title`} className="scroll-mt-20">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 id={`esg-${section}-title`} className="text-lg font-semibold tracking-tight">
                    {section}. {ESG_SECTION_TITLES[section]}
                  </h3>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {done} of {total} answered
                    {scored ? ` · ${scored.points}/${scored.max} points` : ''}
                  </span>
                </div>
                <div className="divide-y border-t">
                  {asked
                    .filter((question) => question.section === section)
                    .map((question) => (
                      <EsgQuestion
                        key={question.number}
                        question={question}
                        answers={answers}
                        automatic={report.automatic}
                        answered={answered.has(question.number)}
                        onChange={change}
                        onDiscard={autosave.discard}
                        onBlur={() => void autosave.flush()}
                      />
                    ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </>
  )
}

function JumpLink({ section, done, total }: { section: EsgSection; done: number; total: number }) {
  const complete = total > 0 && done === total
  return (
    <li>
      <a href={`#esg-${section}`} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 hover:bg-muted">
        <span className="font-medium">
          <span className="text-muted-foreground">{section}.</span> {ESG_SECTION_TITLES[section]}
        </span>
        <span
          className={cn(
            'flex shrink-0 items-center gap-1 text-xs tabular-nums',
            complete ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
          )}
        >
          {complete ? <CircleCheck className="size-3.5" aria-hidden /> : null}
          {done}/{total}
          <span className="sr-only"> answered</span>
        </span>
      </a>
    </li>
  )
}
