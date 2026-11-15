import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BarChart3,
  Check,
  FileText,
  Library,
  Server,
  ShieldCheck,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { useInViewOnce } from '@/hooks/use-in-view-once'
import { cn } from '@hub/ui/lib/utils'

/*
  "Everything you need for GHG reporting": a centred, top-to-bottom feature
  timeline that walks you through the features one at a time.

  - All features sit in one centred column: icon, title, description and
    three key points.
  - On laptop screens and up (lg), a thin line runs down the centre through the
    icons. A green line grows along it as you scroll (both directions), with a
    glowing dot at its tip, and turns each icon green as it arrives.
  - Features fade in as they come into view. The feature in the middle of the
    screen is fully visible; the others are dimmed so you read one at a time.
  - Direction-aware settling: when you pause scrolling inside the timeline,
    the page glides to the next feature in the direction you were scrolling
    and centres it, as long as you scrolled at least NEXT_FEATURE_THRESHOLD
    of the way there. A smaller nudge glides back to the feature you were on.
    One mouse-wheel notch, flick, trackpad swipe or key press = one feature.
    It never runs before the first or after the last feature (so you can
    always leave the section), and any new scroll input takes over.
    (CSS scroll-snap was tried first, but it pulls even full wheel notches
    back and can trap people on a feature.)
  - "Reduce motion": no fading, dimming transitions or settling.
*/

type Feature = {
  icon: LucideIcon
  title: string
  description: string
  points: string[]
}

const features: Feature[] = [
  {
    icon: BarChart3,
    title: 'Emissions tracking',
    description:
      'Record activity data across Scope 1, 2 and 3 using emission factors aligned with the GHG Protocol.',
    points: [
      'Scope 1, 2 and 3 categories',
      'Single entries or bulk CSV upload',
      'Automatic CO2e calculation',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Verification workflow',
    description:
      'Managers review, approve or reject entries, with a full audit trail of who changed what and when.',
    points: ['Approve or reject entries', 'Bulk verification', 'Complete audit trail'],
  },
  {
    icon: Library,
    title: 'Emission factor library',
    description:
      'Start from a built-in factor library or add company-specific factors with version history.',
    points: [
      'Built-in factor library',
      'Custom company-specific factors',
      'Version history and source references',
    ],
  },
  {
    icon: Target,
    title: 'Reduction roadmap',
    description:
      'Set a baseline year, define reduction goals and track initiatives year over year.',
    points: ['Baseline year tracking', 'Goals and initiatives', 'Year-over-year progress'],
  },
  {
    icon: FileText,
    title: 'Disclosure reporting',
    description: 'Prepare SEDG disclosures and ESG readiness reports, and export them as PDF.',
    points: ['SEDG disclosure', 'ESG readiness questionnaire', 'PDF export'],
  },
  {
    icon: Server,
    title: 'Cloud or self-hosted',
    description:
      'Use it online, or run it on your own machine so your data stays on your premises.',
    points: ['Hosted online', 'Install on your own computer', 'Your data, your premises'],
  },
]

/** A feature fades in once its icon is above this point of the screen (0 = top, 1 = bottom). */
const REVEAL_AT = 0.85

/** How long scrolling must pause (ms) before the page settles on a feature. */
const SETTLE_DELAY_MS = 140

/**
 * How far you must scroll, as a share of the distance between two features,
 * before the page moves on to the next one. Less than this glides back to
 * the feature you were on.
 *
 * 0.15 is about the safe maximum: features are ~420px apart on a laptop and one
 * mouse-wheel notch is 100px (~23%). Going above ~0.2 would make single wheel
 * notches glide back every time, so mouse users would get stuck.
 */
const NEXT_FEATURE_THRESHOLD = 0.15

/** Keys that scroll the page. Keyboard scrolling always moves a whole feature. */
const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Spacebar'])

/*
  Heading entrance animation (Tailwind classes).
  ease-[cubic-bezier(0.33,1,0.68,1)] is an "ease-out cubic" curve: it starts
  moving straight away and slows down gently over the whole 1.1s, so you can
  actually see it glide up towards you before it settles.
*/
const ENTRANCE =
  'transition-[opacity,translate,scale,filter] duration-[1100ms] ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none'
const ENTRANCE_HIDDEN =
  'translate-y-12 scale-95 opacity-0 blur-sm motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:opacity-100 motion-reduce:blur-none'
const ENTRANCE_SHOWN = 'translate-y-0 scale-100 opacity-100 blur-none'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function FeaturesSection() {
  const timelineRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLLIElement | null)[]>([])
  const iconRefs = useRef<(HTMLSpanElement | null)[]>([])

  const [reached, setReached] = useState(0) // icons the green line has reached
  const [shown, setShown] = useState(0) // features faded in (only ever goes up)
  const [active, setActive] = useState(0) // feature closest to the middle of the screen

  // Heading entrance: plays once, when the heading is a little way into the screen.
  const { ref: headingRef, inView: headingShown } =
    useInViewOnce<HTMLDivElement>('0px 0px -15% 0px')

  /**
   * Measures the timeline. Positions are stable (offsetTop ignores the fade-in
   * slide). `stops[i]` is the page scroll position (scrollY) at which feature i
   * is centred on screen.
   */
  const measure = useCallback(() => {
    const timeline = timelineRef.current
    const items = itemRefs.current.filter((el): el is HTMLLIElement => el !== null)
    const icons = iconRefs.current.filter((el): el is HTMLSpanElement => el !== null)
    if (!timeline || items.length === 0 || icons.length !== items.length) return null

    const viewport = window.innerHeight
    const maxScroll = document.documentElement.scrollHeight - viewport
    const timelineTop = timeline.getBoundingClientRect().top + window.scrollY
    // Each <li> is positioned inside the <ol>, which sits at the top of the timeline
    const itemTop = (li: HTMLLIElement) => (li.offsetParent as HTMLElement | null)?.offsetTop ?? 0

    const iconCenters = icons.map((icon, i) => {
      const li = items[i]
      return itemTop(li) + li.offsetTop + icon.offsetTop + icon.offsetHeight / 2
    })
    const itemCenters = items.map((li) => itemTop(li) + li.offsetTop + li.offsetHeight / 2)
    const stops = itemCenters.map((c) => clamp(timelineTop + c - viewport / 2, 0, maxScroll))

    return { viewport, maxScroll, timelineTop, iconCenters, itemCenters, stops }
  }, [])

  // 1) Follow the scroll: green line, reached icons, fade-ins, active feature.
  useEffect(() => {
    let frame = 0

    const update = () => {
      frame = 0
      const m = measure()
      if (!m) return
      const scrollY = window.scrollY
      const middle = m.viewport / 2

      // The line runs from the centre of the first icon to the centre of the last.
      const lineStart = m.iconCenters[0]
      const lineLength = m.iconCenters[m.iconCenters.length - 1] - lineStart

      // It starts growing when the first icon reaches the middle of the screen and
      // is full when the last icon does (or when the page can't scroll further).
      const start = m.timelineTop + lineStart - middle
      const end = Math.min(m.timelineTop + lineStart + lineLength - middle, m.maxScroll)
      const progress =
        end - start < 1 ? Number(scrollY >= end) : clamp((scrollY - start) / (end - start), 0, 1)
      const fillPx = progress * lineLength

      // Update the line directly (no React re-render) so it stays perfectly smooth.
      for (const el of [trackRef.current, fillRef.current]) {
        if (el) el.style.top = `${lineStart}px`
      }
      if (trackRef.current) trackRef.current.style.height = `${lineLength}px`
      if (fillRef.current) fillRef.current.style.height = `${fillPx}px`
      if (tipRef.current) {
        tipRef.current.style.top = `${lineStart + fillPx}px`
        tipRef.current.style.opacity = progress > 0 && progress < 1 ? '1' : '0'
      }

      // React skips the re-render whenever a value didn't change
      setReached(
        progress > 0 ? m.iconCenters.filter((c) => c <= lineStart + fillPx + 1).length : 0,
      )
      const screenTop = scrollY - m.timelineTop // timeline coordinates of the screen's top edge
      setShown((prev) =>
        Math.max(prev, m.iconCenters.filter((c) => c - screenTop <= m.viewport * REVEAL_AT).length),
      )
      const screenMiddle = screenTop + middle
      let closest = 0
      m.itemCenters.forEach((c, i) => {
        if (Math.abs(c - screenMiddle) < Math.abs(m.itemCenters[closest] - screenMiddle)) closest = i
      })
      setActive(closest)
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
    }
  }, [measure])

  // 2) Direction-aware settling: after a pause, glide to the next feature in the
  //    direction of the last scroll and centre it.
  useEffect(() => {
    let timer = 0
    let gestureStartY = window.scrollY // where the current scroll gesture began
    let autoScrolling = false // true while we are gliding to a feature ourselves
    let touching = false
    let keyboardGesture = false // this scroll came from the keyboard (arrow keys etc.)

    const settle = () => {
      timer = 0
      const y = window.scrollY

      // Our own glide just finished: the next gesture starts here.
      if (autoScrolling) {
        autoScrolling = false
        gestureStartY = y
        return
      }
      if (touching || prefersReducedMotion()) return

      const startY = gestureStartY // where this scroll began
      const delta = y - startY
      const fromKeyboard = keyboardGesture
      gestureStartY = y
      keyboardGesture = false
      const m = measure()
      if (!m) return
      const { stops } = m
      const last = stops.length - 1

      // Free zones: before the first feature and after the last one.
      if (y < stops[0] - 1 || y > stops[last] + 1) return

      // Find the two features we are between (k and k + 1)
      let k = 0
      while (k < last && stops[k + 1] <= y + 1) k++
      if (Math.abs(y - stops[k]) <= 1) return // already resting on a feature

      const before = stops[k]
      const after = stops[Math.min(k + 1, last)]
      const nearest = Math.abs(y - before) <= Math.abs(after - y) ? before : after
      const inDirection = delta > 0 ? after : before
      // The feature this scroll started from (normally the one you were resting on)
      const home = Math.abs(startY - before) <= Math.abs(startY - after) ? before : after
      // Did this scroll start outside the timeline (coming in from the hero or the footer)?
      const entering = startY < stops[0] - 1 || startY > stops[last] + 1

      let target: number
      if (entering) {
        target = nearest // just arrived: settle on the closest feature
      } else if (fromKeyboard) {
        target = inDirection // one key press = one feature
      } else if (Math.abs(delta) < (after - before) * NEXT_FEATURE_THRESHOLD) {
        target = home // didn't scroll far enough: glide back to where you were
      } else {
        target = inDirection // scrolled far enough: move on in that direction
      }

      if (Math.abs(target - y) <= 1) return
      autoScrolling = true
      window.scrollTo({ top: target, behavior: 'smooth' })
    }

    const onScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(settle, SETTLE_DELAY_MS)
    }

    // Any real user input cancels our glide and starts a new gesture from here.
    const onUserInput = () => {
      if (autoScrolling) {
        autoScrolling = false
        gestureStartY = window.scrollY
      }
    }
    const onWheel = () => {
      keyboardGesture = false
      onUserInput()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!SCROLL_KEYS.has(event.key)) return
      keyboardGesture = true
      onUserInput()
    }
    const onTouchStart = () => {
      touching = true
      keyboardGesture = false
      onUserInput()
    }
    const onTouchEnd = () => {
      touching = false
      onScroll() // settle once the momentum scroll stops
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [measure])

  return (
    <section aria-labelledby="features-heading" className="px-page py-24 lg:py-32">
      {/*
        Heading entrance (once): rises up, grows from 95% and sharpens from a
        slight blur while fading in, so it feels like it moves towards you.
        The line below follows 150ms later.
      */}
      <div ref={headingRef} className="mx-auto max-w-2xl text-center">
        <h2
          id="features-heading"
          className={cn(
            'font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl',
            ENTRANCE,
            headingShown ? ENTRANCE_SHOWN : ENTRANCE_HIDDEN,
          )}
        >
          Everything you need for{' '}
          <span className="text-emerald-600 dark:text-emerald-400">GHG Reporting</span>
        </h2>
        <p
          className={cn(
            'mt-4 text-lg text-muted-foreground delay-150',
            ENTRANCE,
            headingShown ? ENTRANCE_SHOWN : ENTRANCE_HIDDEN,
          )}
        >
          From the first activity record to the final disclosure report.
        </p>
      </div>

      <div ref={timelineRef} className="relative mx-auto mt-20 max-w-3xl lg:mt-28">
        {/* The line (laptop screens and up): grey track, green fill, glowing tip */}
        <div aria-hidden className="hidden lg:block">
          <div
            ref={trackRef}
            className="absolute top-0 left-1/2 w-px -translate-x-1/2 bg-border"
          />
          <div
            ref={fillRef}
            className="absolute top-0 left-1/2 h-0 w-0.5 -translate-x-1/2 rounded-full bg-gradient-to-b from-emerald-300 to-emerald-600"
          />
          <div
            ref={tipRef}
            className="absolute left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500 opacity-0 shadow-[0_0_0_6px] shadow-emerald-500/20 transition-opacity"
          />
        </div>

        <ol className="relative space-y-24 lg:space-y-40">
          {features.map(({ icon: Icon, title, description, points }, i) => {
            const isShown = shown > i
            const isReached = reached > i
            const isActive = active === i
            return (
              <li
                key={title}
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
                className={cn(
                  // relative: makes the <li> the reference point for its icon's offsetTop
                  'relative flex flex-col items-center text-center transition-all duration-700 ease-out',
                  isShown ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0',
                  'motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none',
                )}
              >
                {/* Icon "node" on the line. bg-background hides the line behind it. */}
                <span
                  ref={(el) => {
                    iconRefs.current[i] = el
                  }}
                  className={cn(
                    'relative flex size-14 items-center justify-center rounded-full border bg-background transition-all duration-500',
                    isReached
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-[0_0_0_8px] shadow-emerald-500/15'
                      : 'text-emerald-700 dark:text-emerald-400',
                  )}
                >
                  <Icon className="size-6" aria-hidden />
                </span>

                {/*
                  Text. The outer box's solid bg-background hides the line behind
                  the words; only the inner content is dimmed when not active, so
                  the line never shows through.
                */}
                <div className="relative mt-6 bg-background px-6 py-2">
                  <div
                    className={cn(
                      'transition-opacity duration-500 motion-reduce:transition-none',
                      !isActive && 'opacity-35',
                    )}
                  >
                    <h3 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                      {title}
                    </h3>
                    <p className="mx-auto mt-3 max-w-xl text-lg text-pretty text-muted-foreground">
                      {description}
                    </p>
                    <ul className="mx-auto mt-6 flex w-fit flex-col items-start gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-8">
                      {points.map((point) => (
                        <li key={point} className="flex items-center gap-2">
                          <Check
                            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                            aria-hidden
                          />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
