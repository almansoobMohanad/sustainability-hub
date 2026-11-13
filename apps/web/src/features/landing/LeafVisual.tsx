/*
  LeafVisual: the animated leaf on the right side of the landing page hero.

  Original artwork created for Sustainability Hub. Nothing is traced or copied:
  the leaf outline, midrib and veins are calculated below from a handful of
  numbers (length, width, bend, number of veins) and drawn as SVG.

  Animation (CSS, see "Leaf visual" in index.css):
    1. the leaf grows/fades in,
    2. the veins draw themselves from the base towards the tip,
    3. the whole leaf sways gently, forever.
  All of it is switched off for users with "reduce motion" enabled.
*/

import type { CSSProperties } from 'react'

type Point = { x: number; y: number }

// ---------------------------------------------------------------------------
// Shape settings: change these to reshape the leaf.
// All values are in SVG units; the drawing area (viewBox) is 400 x 500.
// ---------------------------------------------------------------------------
const VIEW_W = 400
const VIEW_H = 500
const BASE: Point = { x: 200, y: 440 } // where the stem joins the leaf
const STEM_END: Point = { x: 184, y: 488 } // bottom of the stem (sway pivot)
const LENGTH = 370 // base -> tip
const MAX_HALF_WIDTH = 125 // widest point, measured from the midrib
const LEFT_SIDE_SCALE = 0.9 // left half slightly narrower, for a natural look
const BEND = 16 // how far the midrib curves to the right
const VEINS_PER_SIDE = 7
const OUTLINE_SEGMENTS = 40 // more = smoother outline

// Colours (Tailwind's emerald palette, in OKLCH)
const EMERALD_300 = 'oklch(0.845 0.143 164.978)'
const EMERALD_500 = 'oklch(0.696 0.17 162.48)'
const EMERALD_700 = 'oklch(0.508 0.118 165.612)'

// ---------------------------------------------------------------------------
// Geometry. "t" runs from 0 (base of the leaf) to 1 (tip).
// ---------------------------------------------------------------------------

/** x position of the midrib (centre line) at t: a gentle curve to the right. */
const midX = (t: number) => BASE.x + BEND * Math.sin(Math.PI * t)

/** y position at t: straight up from the base. */
const yAt = (t: number) => BASE.y - LENGTH * t

/**
 * Half-width of the leaf at t. sin(pi * t^0.8) is 0 at both ends and widest
 * a little below the middle (t ≈ 0.42), which gives a rounded base and a
 * pointed tip, the classic leaf silhouette.
 */
const halfWidth = (t: number) => MAX_HALF_WIDTH * Math.sin(Math.PI * Math.pow(t, 0.8))

const fmt = (p: Point) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`

/**
 * Turns a list of points into smooth cubic Bezier segments ("C ..." commands)
 * that pass through every point (Catmull-Rom spline).
 */
function smoothSegments(points: Point[]): string {
  let d = ''
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    d += ` C ${fmt(c1)} ${fmt(c2)} ${fmt(p2)}`
  }
  return d
}

function sample(from: number, to: number, steps: number, fn: (t: number) => Point) {
  return Array.from({ length: steps + 1 }, (_, i) => fn(from + ((to - from) * i) / steps))
}

/** Leaf outline: up the right edge to the tip, then back down the left edge. */
function buildOutline(): string {
  const right = sample(0, 1, OUTLINE_SEGMENTS, (t) => ({ x: midX(t) + halfWidth(t), y: yAt(t) }))
  const left = sample(1, 0, OUTLINE_SEGMENTS, (t) => ({
    x: midX(t) - halfWidth(t) * LEFT_SIDE_SCALE,
    y: yAt(t),
  }))
  // Two separate smooth runs keep the tip pointed instead of rounding it off.
  return `M ${fmt(right[0])}${smoothSegments(right)}${smoothSegments(left)} Z`
}

/** Midrib: the centre vein from the base almost to the tip. */
function buildMidrib(): string {
  const points = sample(0, 0.96, 16, (t) => ({ x: midX(t), y: yAt(t) }))
  return `M ${fmt(points[0])}${smoothSegments(points)}`
}

type Vein = { d: string; delay: number }

/** Side veins: curve outwards from the midrib, angled towards the tip. */
function buildVeins(): Vein[] {
  const veins: Vein[] = []
  for (let i = 0; i < VEINS_PER_SIDE; i++) {
    for (const side of [1, -1] as const) {
      // Left veins start slightly higher than right ones (alternating, like real leaves)
      // Spread veins between t = 0.1 and ~0.75; the narrow tip has no side veins
      const t = 0.1 + i * 0.1 + (side === -1 ? 0.05 : 0)
      const tEnd = Math.min(t + 0.14, 0.88)
      const reach = side === 1 ? 0.8 : 0.8 * LEFT_SIDE_SCALE
      const start = { x: midX(t), y: yAt(t) }
      const end = { x: midX(tEnd) + side * halfWidth(tEnd) * reach, y: yAt(tEnd) }
      const ctrl = {
        x: start.x + (end.x - start.x) * 0.6,
        y: start.y - (start.y - end.y) * 0.2,
      }
      veins.push({
        d: `M ${fmt(start)} Q ${fmt(ctrl)} ${fmt(end)}`,
        // Draw from the base upwards, left side a moment after the right
        delay: 0.6 + i * 0.15 + (side === -1 ? 0.07 : 0),
      })
    }
  }
  return veins
}

// The shape never changes, so calculate it once when the file loads.
const OUTLINE = buildOutline()
const MIDRIB = buildMidrib()
const VEINS = buildVeins()
const STEM = `M ${fmt(BASE)} Q ${fmt({ x: BASE.x - 2, y: BASE.y + 28 })} ${fmt(STEM_END)}`

// Sway and grow pivot around the bottom of the stem.
const pivot = { transformOrigin: `${STEM_END.x}px ${STEM_END.y}px` }

export function LeafVisual() {
  return (
    <div aria-hidden className="relative flex w-full max-w-md items-center justify-center">
      {/*
        Soft glow behind the leaf. A radial gradient (not a blur filter), so it
        is perfectly smooth with no banding rings, and cheap to render.
      */}
      <div
        className="absolute inset-0"
        style={{
          // emerald-500 at 18% in the centre, fading to transparent at the edges
          background: 'radial-gradient(closest-side, oklch(0.696 0.17 162.48 / 0.18), transparent)',
        }}
      />

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="relative w-full drop-shadow-xl"
        fill="none"
      >
        <defs>
          <linearGradient id="leaf-fill" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={EMERALD_300} />
            <stop offset="0.5" stopColor={EMERALD_500} />
            <stop offset="1" stopColor={EMERALD_700} />
          </linearGradient>
        </defs>

        <g className="leaf-sway" style={pivot}>
          <g className="leaf-grow" style={pivot}>
            {/* Stem */}
            <path d={STEM} stroke={EMERALD_700} strokeWidth={6} strokeLinecap="round" />

            {/* Leaf body */}
            <path
              d={OUTLINE}
              fill="url(#leaf-fill)"
              stroke={EMERALD_700}
              strokeOpacity={0.3}
              strokeWidth={1.5}
            />

            {/* Midrib */}
            <path
              d={MIDRIB}
              pathLength={1}
              className="leaf-draw"
              style={{ '--leaf-delay': '0.35s' } as CSSProperties}
              stroke="white"
              strokeOpacity={0.6}
              strokeWidth={3}
              strokeLinecap="round"
            />

            {/* Side veins */}
            {VEINS.map((vein, i) => (
              <path
                key={i}
                d={vein.d}
                pathLength={1}
                className="leaf-draw"
                style={{ '--leaf-delay': `${vein.delay}s` } as CSSProperties}
                stroke="white"
                strokeOpacity={0.45}
                strokeWidth={2}
                strokeLinecap="round"
              />
            ))}
          </g>
        </g>
      </svg>
    </div>
  )
}
