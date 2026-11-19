import { useRef, useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@hub/ui/components/tooltip'
import { cn } from '@hub/ui/lib/utils'

/**
 * A small (i) button that explains something on hover, keyboard focus or tap,
 * so helper text doesn't have to sit on the page all the time.
 *
 * Radix tooltips ignore taps (touch screens have no hover), so a tap toggles it
 * here. A tap also focuses the button, which already opens it, so the toggle
 * uses the state from BEFORE the finger touched down. Mouse, keyboard (and
 * Safari, whose clicks have no pointerType) clicks only open. preventDefault
 * stops Radix's own click handler, which would close it again; tapping
 * elsewhere closes it (Radix's outside-press).
 */
export function InfoTip({
  label,
  children,
  side = 'top',
  className,
}: {
  /** What the button explains, for screen readers: "About scopes" */
  label: string
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const openAtPointerDown = useRef(false)
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onPointerDown={() => {
            openAtPointerDown.current = open
          }}
          onClick={(event) => {
            event.preventDefault()
            const { pointerType } = event.nativeEvent as PointerEvent
            setOpen(pointerType === 'touch' || pointerType === 'pen' ? !openAtPointerDown.current : true)
          }}
          className={cn(
            'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none',
            className,
          )}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} sideOffset={4} collisionPadding={12} className="max-w-72 flex-col items-start gap-1 text-left leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}
