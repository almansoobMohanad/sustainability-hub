import type { ReactNode } from 'react'
import { cn } from '@hub/ui/lib/utils'
import { InfoTip } from './info-tip'

/*
  The building blocks of an app page (see AGENTS.md "UI design"):

    <PageHeader title="Members" />          sticky bar: sidebar toggle + page name
    <PageBody>                              left-aligned, same padding everywhere
      <PageTitle title="..." info="..." actions={...} />
      <PageSection title="..." info="...">  flat section: title left (lg), content right
      ...

  Explanations go behind the (i) of PageTitle / PageSection, not in always-visible
  helper text under headings (user feedback 2026-11-19).
*/

/** The page content area: left-aligned next to the sidebar (not centred), optional max width */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex w-full flex-col gap-5 px-4 pt-6 pb-8 md:px-8 md:pt-8', className)}>{children}</div>
}

/** The page's heading with an optional (i) explanation and actions on the right */
export function PageTitle({
  title,
  info,
  infoLabel = `About ${title.toLowerCase()}`,
  actions,
}: {
  title: string
  info?: ReactNode
  /** The (i) button's name for screen readers */
  infoLabel?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1.5">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {info ? (
          <InfoTip label={infoLabel} side="bottom">
            {info}
          </InfoTip>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/**
 * One flat section of a form or settings page: title (+ optional mark, (i) and
 * note) on the left on large screens, content on the right. Put several in a
 * `divide-y` container; no cards.
 */
export function PageSection({
  id,
  title,
  info,
  mark,
  note,
  children,
  className,
}: {
  /** Used for aria-labelledby; must be unique on the page */
  id: string
  title: string
  info?: ReactNode
  /** Something before the title, e.g. a step number */
  mark?: ReactNode
  /** A short word under the title, e.g. "Optional" */
  note?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn('grid gap-x-12 gap-y-5 py-6 lg:grid-cols-[11rem_minmax(0,1fr)]', className)}
    >
      <div className="flex items-center gap-3 self-start">
        {mark}
        <div className="flex flex-col">
          <span className="flex items-center gap-1">
            <h3 id={id} className="text-sm font-semibold">
              {title}
            </h3>
            {info ? <InfoTip label={`About ${title.toLowerCase()}`}>{info}</InfoTip> : null}
          </span>
          {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </section>
  )
}
