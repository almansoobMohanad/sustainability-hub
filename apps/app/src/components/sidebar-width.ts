/** Sidebar width limits (px), shared by the layout and the resize handle. */

export const SIDEBAR_DEFAULT_WIDTH = 256
export const SIDEBAR_MIN_WIDTH = 208
export const SIDEBAR_MAX_WIDTH = 420
/** Dragging narrower than this collapses the sidebar to icons. */
export const SIDEBAR_COLLAPSE_BELOW = 150
/** Width of the collapsed (icons only) sidebar: shadcn's 3rem. */
export const SIDEBAR_ICON_WIDTH = 48

export const clampSidebarWidth = (width: number) =>
  Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)))
