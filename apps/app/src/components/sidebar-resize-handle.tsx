import { useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useSidebar } from '@hub/ui/components/sidebar'
import { cn } from '@hub/ui/lib/utils'
import {
  SIDEBAR_COLLAPSE_BELOW as COLLAPSE_BELOW,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_ICON_WIDTH as ICON_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
} from './sidebar-width'

/*
  A draggable edge on the right side of the sidebar (desktop only).

  - Drag to resize between MIN_WIDTH and MAX_WIDTH.
  - Drag narrower than COLLAPSE_BELOW to collapse to icons; drag out again to expand.
  - Double-click to reset to the default width (and expand if collapsed).
  - Keyboard: focus it with Tab, then Left/Right to resize, Enter to collapse/expand.
  The width itself lives in AppLayout (it sets the --sidebar-width CSS variable);
  the limits are in sidebar-width.ts.
*/

const KEYBOARD_STEP = 16

type Props = {
  width: number
  onWidthChange: (width: number) => void
  /** Called when a drag or key press finishes, e.g. to save the width. */
  onCommit?: () => void
}

export function SidebarResizeHandle({ width, onWidthChange, onCommit }: Props) {
  const { state, setOpen } = useSidebar()
  const collapsed = state === 'collapsed'
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startX: event.clientX, startWidth: collapsed ? ICON_WIDTH : width }
    // While dragging: no width animation, resize cursor everywhere, no text selection
    document.body.classList.add('sidebar-resizing')
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const next = drag.current.startWidth + (event.clientX - drag.current.startX)
    if (next < COLLAPSE_BELOW) {
      if (!collapsed) setOpen(false)
    } else {
      if (collapsed) setOpen(true)
      onWidthChange(clampSidebarWidth(next))
    }
  }

  const endDrag = () => {
    if (!drag.current) return
    drag.current = null
    document.body.classList.remove('sidebar-resizing')
    onCommit?.()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      if (collapsed) {
        if (event.key === 'ArrowRight') setOpen(true)
        return
      }
      const delta = event.key === 'ArrowRight' ? KEYBOARD_STEP : -KEYBOARD_STEP
      if (event.key === 'ArrowLeft' && width <= SIDEBAR_MIN_WIDTH) setOpen(false)
      else onWidthChange(clampSidebarWidth(width + delta))
      onCommit?.()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      setOpen(collapsed)
    }
  }

  const resetWidth = () => {
    setOpen(true)
    onWidthChange(SIDEBAR_DEFAULT_WIDTH)
    onCommit?.()
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      aria-valuenow={collapsed ? ICON_WIDTH : width}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={resetWidth}
      onKeyDown={onKeyDown}
      className={cn(
        // An 8px-wide grab area straddling the sidebar's right border
        'absolute inset-y-0 -right-1 z-20 hidden w-2 cursor-col-resize touch-none outline-none md:block',
        // A thin line appears on hover / focus / drag
        'after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:transition-colors',
        'hover:after:w-0.5 hover:after:bg-emerald-500/60 focus-visible:after:w-0.5 focus-visible:after:bg-emerald-600',
        '[.sidebar-resizing_&]:after:w-0.5 [.sidebar-resizing_&]:after:bg-emerald-600',
      )}
    />
  )
}
