import { useInViewOnce } from '@/hooks/use-in-view-once'
import { cn } from '@/lib/utils'

/*
  A soft "horizon" between the hero and the features section: a hairline that
  is faintly green in the middle and fades out to nothing at both ends, with a
  very faint green glow around it.

  The hero is exactly one screen tall, so this sits just below the bottom edge
  of the screen on load. The first time it scrolls into view, the line draws
  outward from the centre and the glow fades in.
*/

const EASE = 'duration-[1200ms] ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none'

export function SectionDivider() {
  const { ref, inView } = useInViewOnce<HTMLDivElement>()

  return (
    <div ref={ref} aria-hidden className="relative px-page">
      {/*
        Glow: a wide, very soft green ellipse centred on the line. Drawn as a
        radial gradient (not a blur filter), so it is perfectly smooth with no
        banding rings, and cheap to render.
      */}
      <div
        className={cn(
          'pointer-events-none absolute top-1/2 left-1/2 h-32 w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 transition-opacity',
          EASE,
          inView ? 'opacity-100' : 'opacity-0 motion-reduce:opacity-100',
        )}
        style={{
          // emerald-400 at 14% in the centre, fading to transparent at the edges
          background:
            'radial-gradient(closest-side, oklch(0.765 0.177 163.223 / 0.14), transparent)',
        }}
      />
      {/* Line: transparent -> faint green -> transparent, drawn from the centre outwards */}
      <div
        className={cn(
          'relative mx-auto h-px max-w-5xl origin-center bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent transition-[scale,opacity]',
          EASE,
          inView
            ? 'scale-x-100 opacity-100'
            : 'scale-x-0 opacity-0 motion-reduce:scale-x-100 motion-reduce:opacity-100',
        )}
      />
    </div>
  )
}
