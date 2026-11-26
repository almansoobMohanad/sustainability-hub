import { ESG_BANDS, ESG_SCORED_SECTIONS, ESG_SECTION_TITLES, type esgScore } from '@hub/shared/esg-ready'
import { InfoTip } from '@/components/info-tip'

/*
  The readiness score at the top of the page, worked out live from the answers:
  the total (a percentage of 108 points and its band) and one thin bar per
  scored section. One hue, numbers always as text next to the bars (the bars
  only show the same thing at a glance, so they're hidden from screen readers).
*/

type Score = ReturnType<typeof esgScore>

const percentOf = (points: number, max: number) => (max ? Math.round((points / max) * 100) : 0)

export function ScoreSummary({ score, answered, asked }: { score: Score; answered: number; asked: number }) {
  return (
    <section aria-labelledby="esg-score-title" className="grid gap-x-12 gap-y-6 rounded-xl border p-5 md:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
          <h3 id="esg-score-title">Readiness score</h3>
          <InfoTip label="About the readiness score">
            Each answer earns 0 to 3 points by how far along it is (1 point per stakeholder engaged, up to 6), out of 108.
            Unanswered questions earn nothing. Bands: Getting started below {ESG_BANDS[2].min}%, Developing from{' '}
            {ESG_BANDS[2].min}%, Good progress from {ESG_BANDS[1].min}%, Excellent from {ESG_BANDS[0].min}%. The section
            about your company isn&apos;t scored.
          </InfoTip>
        </span>
        <p className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight tabular-nums">{score.percent}%</span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {score.points} of {score.max} points
          </span>
        </p>
        <p className="text-sm">
          <span className="font-semibold">{score.band.label}</span>
          <span className="text-muted-foreground"> · {score.band.description}</span>
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {answered} of {asked} questions answered
        </p>
      </div>

      <ul className="flex flex-col justify-center gap-3" aria-label="Score per section">
        {ESG_SCORED_SECTIONS.map((section) => {
          const { points, max } = score.sections[section]
          const percent = percentOf(points, max)
          return (
            <li key={section} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5">
              <span className="truncate text-sm">
                <span className="text-muted-foreground">{section}.</span> {ESG_SECTION_TITLES[section]}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {points}/{max} · {percent}%
              </span>
              <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-emerald-600 transition-[width] duration-300 motion-reduce:transition-none dark:bg-emerald-400"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
