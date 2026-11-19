import type { ReactNode } from 'react'
import { Badge } from '@hub/ui/components/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@hub/ui/components/tooltip'
import { SCOPE_INFO } from '@/features/emissions/types'
import { formatFactor, perUnit, unitLabel } from './format'
import type { EmissionSource, FactorValue, Scope } from './queries'

/*
  Emission sources as a list: name, category, units, and (when known) the
  factor for the chosen year. Used on the Emission sources page and in the
  "Add sources" dialog; the caller supplies the action (remove / add).
*/

type ListedSource = EmissionSource & { factors?: FactorValue[]; defaultUnit?: string | null }

export function SourceRow({ source, year, action }: { source: ListedSource; year?: number; action?: ReactNode }) {
  const factors = source.factors ?? []
  // The unit offered first: the company's default, otherwise the first one
  const main = factors.find((factor) => factor.unit === source.defaultUnit) ?? factors[0]
  const otherUnits = factors.filter((factor) => factor !== main).map((factor) => unitLabel(factor.unit))

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium [overflow-wrap:anywhere]">{source.name}</p>
        <p className="text-xs text-muted-foreground">
          {source.category}
          {otherUnits.length > 0 ? ` · also in ${otherUnits.join(', ')}` : null}
        </p>
      </div>
      <div className="flex items-start justify-between gap-3 sm:justify-end">
        {main ? (
          <div className="text-sm sm:text-right">
            <p className="font-medium tabular-nums">
              {formatFactor(main.kgCo2ePerUnit)}{' '}
              <span className="font-normal text-muted-foreground">{perUnit(main.unit)}</span>
            </p>
            {year !== undefined && main.year !== year ? <FallbackYear factorYear={main.year} year={year} /> : null}
          </div>
        ) : null}
        {action}
      </div>
    </li>
  )
}

/** The factor comes from another year's set: say so, never hide it */
function FallbackYear({ factorYear, year }: { factorYear: number; year: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="mt-1 font-normal text-muted-foreground" tabIndex={0}>
          {factorYear} factor
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64">
        {factorYear < year
          ? `There is no ${year} factor for this source yet, so the latest earlier one (${factorYear}) is used.`
          : `There is no ${year} factor for this source, so the earliest available one (${factorYear}) is used.`}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Sources grouped under Scope 1, 2 and 3 header rows (empty scopes left out),
 * meant to sit in a bordered, rounded container (like the Entries table).
 */
export function SourcesByScope<T extends ListedSource>({
  sources,
  renderRow,
}: {
  sources: T[]
  renderRow: (source: T) => ReactNode
}) {
  return (
    <div className="divide-y">
      {([1, 2, 3] as Scope[]).map((scope) => {
        const inScope = sources.filter((source) => source.scope === scope)
        if (inScope.length === 0) return null
        return (
          <section key={scope} aria-labelledby={`scope-${scope}-heading`}>
            <h3
              id={`scope-${scope}-heading`}
              className="flex items-center gap-2 bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground"
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--scope-${scope})` }} aria-hidden />
              <span className="text-foreground">{SCOPE_INFO[scope].label}</span>
              {SCOPE_INFO[scope].short}
              <span className="ml-auto tabular-nums">
                {inScope.length} {inScope.length === 1 ? 'source' : 'sources'}
              </span>
            </h3>
            {/* Rows get the container's side padding here (the Add sources dialog lists them unpadded) */}
            <ul className="divide-y border-t [&>li]:px-4">{inScope.map(renderRow)}</ul>
          </section>
        )
      })}
    </div>
  )
}
