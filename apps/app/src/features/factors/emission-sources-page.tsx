import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Layers, Plus, X } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hub/ui/components/select'
import { Skeleton } from '@hub/ui/components/skeleton'
import { toast } from '@hub/ui/components/sonner'
import { can } from '@hub/shared/permissions'
import { SECTOR_INFO } from '@hub/shared/sectors'
import { PageHeader } from '@/components/page-header'
import { PageBody, PageTitle } from '@/components/page-layout'
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
  year by default); Admins and Managers add and remove sources (with Undo).
*/

export function EmissionSourcesPage() {
  const me = useMe()
  const company = me.company!
  const canManage = can(me.role, 'sources', 'update')
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [dialogOpen, setDialogOpen] = useState(false)

  const library = useQuery(factorLibraryQueryOptions)
  const settings = useQuery(companySettingsQueryOptions(company.id))
  const sources = useQuery(companySourcesQueryOptions(company.id, year))
  const add = useAddCompanySources(company.id)
  const remove = useRemoveCompanySource(company.id)

  const years = library.data ? selectableYears(library.data.years.map((entry) => entry.year)) : [year]
  const sector = settings.data?.sector ?? null
  const list = sources.data?.sources ?? []

  async function removeSource(source: CompanySource) {
    try {
      await remove.mutateAsync(source.id)
      toast.success(`Stopped tracking ${source.name}`, {
        action: {
          label: 'Undo',
          onClick: () =>
            void add
              .mutateAsync([{ sourceId: source.id, defaultUnit: source.defaultUnit }])
              .then(() => toast.success(`Tracking ${source.name} again`))
              .catch((error: unknown) => toast.error(errorMessage(error))),
        },
      })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <>
      <PageHeader title="Emission sources" />
      <PageBody className="max-w-5xl">
        <PageTitle
          title="Emission sources"
          info={
            <>
              <span>
                What {company.name} measures. The Add emissions form offers only these sources.
                {sector ? ` The list started from the ${SECTOR_INFO[sector].label.toLowerCase()} template.` : null}
              </span>
              <span>The factor shown is the one for the chosen reporting year.</span>
            </>
          }
          actions={
            <>
              <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
                <SelectTrigger aria-label="Reporting year of the factors" className="w-28 rounded-full data-[size=default]:h-9">
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
              {canManage ? (
                <Button className="h-9 rounded-full px-4" onClick={() => setDialogOpen(true)}>
                  <Plus aria-hidden />
                  Add sources
                </Button>
              ) : null}
            </>
          }
        />

        <div className="overflow-hidden rounded-xl border">
          {sources.isPending ? (
            <div className="space-y-3 p-4" aria-label="Loading emission sources">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : sources.isError ? (
            <p role="alert" className="p-4 text-sm text-destructive">
              {errorMessage(sources.error)}
            </p>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted">
                <Layers className="size-5 text-muted-foreground" aria-hidden />
              </span>
              <p className="font-medium">No emission sources yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {canManage
                  ? 'Add the sources your company uses: fuels, electricity, refrigerants, travel, waste.'
                  : 'An Admin or Manager chooses which sources the company tracks.'}
              </p>
              {canManage ? (
                <Button className="mt-1 rounded-full" onClick={() => setDialogOpen(true)}>
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
                        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
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
        </div>

        {/* Licence attribution (Open Government Licence), and who to ask for changes */}
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {library.data ? (
            <p>
              Factors: {library.data.title} ({library.data.publisher},{' '}
              <a href={library.data.licenceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                {library.data.licence}
              </a>
              ).
            </p>
          ) : null}
          {!canManage ? (
            <p>
              Need another source? Ask an Admin or Manager (see{' '}
              <Link to="/settings/members" className="underline underline-offset-4">
                Members
              </Link>
              ).
            </p>
          ) : null}
        </div>
      </PageBody>

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
