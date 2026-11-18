import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CircleAlert, CircleCheck, Plus, X } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import { Card, CardContent } from '@hub/ui/components/card'
import { Label } from '@hub/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hub/ui/components/select'
import { Skeleton } from '@hub/ui/components/skeleton'
import { can } from '@hub/shared/permissions'
import { SECTOR_INFO } from '@hub/shared/sectors'
import { PageHeader } from '@/components/page-header'
import { useMe } from '@/features/company/me'
import { errorMessage } from '@/lib/api'
import { AddSourcesDialog } from './add-sources-dialog'
import { selectableYears } from './format'
import {
  companySettingsQueryOptions,
  companySourcesQueryOptions,
  factorLibraryQueryOptions,
  useAddCompanySources,
  useRemoveCompanySource,
  type CompanySource,
} from './queries'
import { SourceRow, SourcesByScope } from './source-list'

/*
  Emission sources: what the company measures. The Add emissions form offers
  only these. Everyone sees the list and the factors for a chosen year (this
  year by default); Admins and Managers add and remove sources.
*/

type Feedback = { tone: 'error' | 'success'; text: string; undo?: () => void } | null

export function EmissionSourcesPage() {
  const me = useMe()
  const company = me.company!
  const canManage = can(me.role, 'sources', 'update')
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const library = useQuery(factorLibraryQueryOptions)
  const settings = useQuery(companySettingsQueryOptions(company.id))
  const sources = useQuery(companySourcesQueryOptions(company.id, year))
  const add = useAddCompanySources(company.id)
  const remove = useRemoveCompanySource(company.id)

  const years = library.data ? selectableYears(library.data.years.map((entry) => entry.year)) : [year]
  const sector = settings.data?.sector ?? null
  const list = sources.data?.sources ?? []

  async function removeSource(source: CompanySource) {
    setFeedback(null)
    try {
      await remove.mutateAsync(source.id)
      setFeedback({
        tone: 'success',
        text: `Stopped tracking ${source.name}.`,
        undo: () => {
          setFeedback(null)
          add
            .mutateAsync([{ sourceId: source.id, defaultUnit: source.defaultUnit }])
            .catch((error: unknown) => setFeedback({ tone: 'error', text: errorMessage(error) }))
        },
      })
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error) })
    }
  }

  return (
    <>
      <PageHeader
        title="Emission sources"
        demoData={false}
        actions={
          canManage ? (
            <Button size="sm" className="rounded-full" onClick={() => setDialogOpen(true)}>
              <Plus aria-hidden />
              Add sources
            </Button>
          ) : null
        }
      />
      <div className="grid w-full max-w-4xl gap-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl space-y-1 text-sm text-muted-foreground">
            <p>
              What {company.name} measures. The Add emissions form offers only these sources.
              {sector ? ` Started from the ${SECTOR_INFO[sector].label.toLowerCase()} template.` : null}
            </p>
            {library.data ? (
              <p>
                Factors: {library.data.title} ({library.data.publisher},{' '}
                <a href={library.data.licenceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                  {library.data.licence}
                </a>
                ).
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="factor-year">Reporting year</Label>
            <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
              <SelectTrigger id="factor-year" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {feedback ? (
          <p
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            className={
              feedback.tone === 'error'
                ? 'flex items-start gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive'
                : 'flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
            }
          >
            {feedback.tone === 'error' ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <span className="flex-1">{feedback.text}</span>
            {feedback.undo ? (
              <button type="button" onClick={feedback.undo} className="font-medium underline underline-offset-4">
                Undo
              </button>
            ) : null}
          </p>
        ) : null}

        <Card>
          <CardContent>
            {sources.isPending ? (
              <div className="space-y-4" aria-label="Loading emission sources">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : sources.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(sources.error)}
              </p>
            ) : list.length === 0 ? (
              <div className="py-8 text-center">
                <p className="font-medium">No emission sources yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {canManage
                    ? 'Add the sources your company uses: fuels, electricity, refrigerants, travel, waste.'
                    : 'An Admin or Manager chooses which sources the company tracks.'}
                </p>
                {canManage ? (
                  <Button className="mt-4 rounded-full" onClick={() => setDialogOpen(true)}>
                    <Plus aria-hidden />
                    Add sources
                  </Button>
                ) : null}
              </div>
            ) : (
              <SourcesByScope
                sources={list}
                renderRow={(source) => (
                  <SourceRow
                    key={source.id}
                    source={source}
                    year={year}
                    action={
                      canManage ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 text-muted-foreground"
                          disabled={remove.isPending}
                          onClick={() => removeSource(source)}
                          aria-label={`Stop tracking ${source.name}`}
                        >
                          <X aria-hidden />
                        </Button>
                      ) : null
                    }
                  />
                )}
              />
            )}
          </CardContent>
        </Card>

        {!canManage ? (
          <p className="text-sm text-muted-foreground">
            Need another source? Ask an Admin or Manager, see{' '}
            <Link to="/settings/members" className="underline underline-offset-4">
              Members
            </Link>
            .
          </p>
        ) : null}
      </div>

      {canManage ? (
        <AddSourcesDialog
          companyId={company.id}
          year={year}
          sector={sector}
          trackedIds={new Set(list.map((source) => source.id))}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      ) : null}
    </>
  )
}
