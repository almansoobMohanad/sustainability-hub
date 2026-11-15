import type { ReactNode } from 'react'
import { Database } from 'lucide-react'
import { Badge } from '@hub/ui/components/badge'
import { Separator } from '@hub/ui/components/separator'
import { SidebarTrigger } from '@hub/ui/components/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@hub/ui/components/tooltip'

/** The bar at the top of every app page: sidebar toggle, page title, demo-data notice. */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <h1 className="truncate text-sm font-medium">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        {actions}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1.5 text-muted-foreground" tabIndex={0}>
              <Database className="size-3" aria-hidden />
              Demo data
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-64">
            The API isn't connected yet. Sample data and anything you add are stored in this
            browser only.
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
