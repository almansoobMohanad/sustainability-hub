import { useState } from 'react'
import { SCOPES, SCOPE_INFO, type Scope } from '@/features/emissions/types'
import { useElementWidth } from '@/hooks/use-element-width'
import { formatTonnes, monthName } from '@/lib/format'
import type { MonthSummary } from '@/features/emissions/types'

/*
  Monthly emissions as stacked columns (Scope 1 at the bottom, then 2, then 3).

  Follows the data-viz spec used for this project:
  - columns are at most 24px wide; 4px rounded top on the whole stack, square at
    the baseline; a 2px surface-coloured gap between segments
  - one y-axis in tonnes CO2e, hairline gridlines, recessive axis text
  - hover OR keyboard focus on a month shows one tooltip with every scope;
    the other months dim so the hovered one stands out
  - selective direct labels: scope names beside the latest month (when the
    segment is tall enough) and the total on the highest month only
  - text never uses the scope colours; colour only marks the bars and swatches
  The legend and a table view live in the parent card.
*/

const HEIGHT = 280
const MARGIN = { top: 24, right: 64, bottom: 28, left: 52 }
const MAX_BAR_WIDTH = 24
const SEGMENT_GAP = 2
const CORNER = 4
const MIN_LABEL_SEGMENT = 16 // px: shorter segments get no direct label

const scopeColor = (scope: Scope) => `var(--scope-${scope})`

/** A "nice" axis maximum and tick step (1, 2, 2.5, 5 x 10^n). */
function niceScale(maxValue: number, targetTicks = 4) {
  if (maxValue <= 0) return { max: 1, step: 0.25 }
  const rough = maxValue / targetTicks
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough)!
  return { max: Math.ceil(maxValue / step) * step, step }
}

/** Rectangle path with only the top corners rounded (data end), square at the baseline. */
function topRoundedRect(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, h, w / 2)
  return [
    `M${x},${y + h}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `H${x + w - radius}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `V${y + h}`,
    'Z',
  ].join(' ')
}

const TOOLTIP_WIDTH = 192 // matches w-48
const TOOLTIP_HEIGHT = 140 // approximate, for keeping it inside the chart
const TOOLTIP_OFFSET = 12

/** Beside the column: to its right if it fits, otherwise to its left. */
function tooltipPosition(barLeft: number, barWidth: number, barTop: number, chartWidth: number) {
  const right = barLeft + barWidth + TOOLTIP_OFFSET
  const left =
    right + TOOLTIP_WIDTH <= chartWidth ? right : barLeft - TOOLTIP_OFFSET - TOOLTIP_WIDTH
  return {
    left: Math.max(0, left),
    top: Math.min(Math.max(0, barTop - 8), HEIGHT - TOOLTIP_HEIGHT),
  }
}

type Props = {
  months: MonthSummary[]
  year: number
}

export function MonthlyScopeChart({ months, year }: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const totalsT = months.map((m) => m.total / 1000) // tonnes
  const { max, step } = niceScale(Math.max(...totalsT))
  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom
  const band = plotW / 12
  const barW = Math.min(MAX_BAR_WIDTH, band * 0.56)
  const y = (tonnes: number) => MARGIN.top + plotH - (tonnes / max) * plotH
  const barX = (month: number) => MARGIN.left + band * month + (band - barW) / 2
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step)

  const withData = months.filter((m) => m.hasData)
  const latest = withData.at(-1)
  const highest = withData.reduce<MonthSummary | undefined>(
    (best, m) => (!best || m.total > best.total ? m : best),
    undefined,
  )
  const showEveryOtherMonth = band < 34

  const activeMonth = active === null ? null : months[active]

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="group"
          aria-label={`Monthly emissions by scope in ${year}, in tonnes CO2e. Use Tab to move between months.`}
          className="block overflow-visible"
          onPointerLeave={() => setActive(null)}
        >
          {/* Gridlines + y-axis labels */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + plotW}
                y1={y(t)}
                y2={y(t)}
                className={t === 0 ? 'stroke-foreground/25' : 'stroke-border'}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={MARGIN.left - 10}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {t.toLocaleString('en')}
              </text>
            </g>
          ))}
          <text
            x={MARGIN.left - 10}
            y={MARGIN.top - 12}
            textAnchor="end"
            className="fill-muted-foreground text-[11px]"
          >
            t CO2e
          </text>

          {/* Month labels */}
          {months.map((m) =>
            showEveryOtherMonth && m.month % 2 === 1 ? null : (
              <text
                key={m.month}
                x={MARGIN.left + band * m.month + band / 2}
                y={HEIGHT - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {monthName(m.month)}
              </text>
            ),
          )}

          {/* Stacked columns */}
          {months.map((m) => {
            if (!m.hasData) return null
            const x = barX(m.month)
            const dimmed = active !== null && active !== m.month
            let base = 0 // running total in tonnes
            const segments = SCOPES.filter((s) => m.byScope[s] > 0).map((scope, i, visible) => {
              const valueT = m.byScope[scope] / 1000
              const bottom = y(base) - (i > 0 ? SEGMENT_GAP : 0) // gap above the segment below
              const top = y(base + valueT)
              base += valueT
              return { scope, top, height: Math.max(0, bottom - top), isTop: i === visible.length - 1 }
            })
            return (
              <g
                key={m.month}
                className="transition-opacity duration-150 motion-reduce:transition-none"
                opacity={dimmed ? 0.35 : 1}
              >
                {segments.map((seg) =>
                  seg.isTop ? (
                    <path
                      key={seg.scope}
                      d={topRoundedRect(x, seg.top, barW, seg.height, CORNER)}
                      fill={scopeColor(seg.scope)}
                    />
                  ) : (
                    <rect
                      key={seg.scope}
                      x={x}
                      y={seg.top}
                      width={barW}
                      height={seg.height}
                      fill={scopeColor(seg.scope)}
                    />
                  ),
                )}
                {/* Direct labels: scope names beside the latest month only */}
                {latest?.month === m.month &&
                  segments.map((seg) =>
                    seg.height >= MIN_LABEL_SEGMENT ? (
                      <text
                        key={`label-${seg.scope}`}
                        x={x + barW + 8}
                        y={seg.top + seg.height / 2}
                        dy="0.32em"
                        className="fill-muted-foreground text-[11px]"
                      >
                        {SCOPE_INFO[seg.scope].label}
                      </text>
                    ) : null,
                  )}
                {/* Value on the cap of the highest month only */}
                {highest?.month === m.month && (
                  <text
                    x={x + barW / 2}
                    y={y(m.total / 1000) - 8}
                    textAnchor="middle"
                    className="fill-foreground text-[11px] font-medium tabular-nums"
                  >
                    {formatTonnes(m.total)}
                  </text>
                )}
              </g>
            )
          })}

          {/* Hit targets: the whole month column (much bigger than the bar), hover + keyboard */}
          {months.map((m) =>
            m.hasData ? (
              <rect
                key={`hit-${m.month}`}
                x={MARGIN.left + band * m.month}
                y={MARGIN.top}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={`${monthName(m.month)} ${year}: ${formatTonnes(m.total)} tonnes CO2e in total. ${SCOPES.map(
                  (s) => `${SCOPE_INFO[s].label} ${formatTonnes(m.byScope[s])}`,
                ).join(', ')}.`}
                className="cursor-default outline-none focus-visible:fill-foreground/5"
                onPointerEnter={() => setActive(m.month)}
                onFocus={() => setActive(m.month)}
                onBlur={() => setActive(null)}
              />
            ) : null,
          )}
        </svg>
      )}

      {/* Tooltip: values lead, scope names follow, short line keys.
          Placed beside the hovered column (right side, or left near the edge)
          so it never covers the bar being read. */}
      {activeMonth && activeMonth.hasData && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 w-48 rounded-lg border bg-popover px-3 py-2.5 text-popover-foreground shadow-md"
          style={tooltipPosition(barX(activeMonth.month), barW, y(activeMonth.total / 1000), width)}
        >
          <p className="text-xs text-muted-foreground">
            {monthName(activeMonth.month)} {year}
          </p>
          <ul className="mt-1.5 space-y-1">
            {[...SCOPES].reverse().map((s) => (
              <li key={s} className="flex items-center gap-2 text-sm">
                <span className="h-0.5 w-3 rounded-full" style={{ background: scopeColor(s) }} />
                <span className="font-semibold tabular-nums">{formatTonnes(activeMonth.byScope[s])} t</span>
                <span className="text-muted-foreground">{SCOPE_INFO[s].label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 flex items-baseline justify-between border-t pt-1.5 text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold tabular-nums">{formatTonnes(activeMonth.total)} t CO2e</span>
          </p>
        </div>
      )}
    </div>
  )
}
