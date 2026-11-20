import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Check, CircleX, Download, FileSpreadsheet, Loader2, TriangleAlert, Upload } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@hub/ui/components/alert-dialog'
import { Button } from '@hub/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@hub/ui/components/dialog'
import { toast } from '@hub/ui/components/sonner'
import { cn } from '@hub/ui/lib/utils'
import { IMPORT_COLUMN_LABELS, IMPORT_LIMITS } from '@hub/shared/imports'
import { InfoTip } from '@/components/info-tip'
import { useMe } from '@/features/company/me'
import { companySourcesQueryOptions } from '@/features/factors/queries'
import { ApiRequestError, errorMessage } from '@/lib/api'
import { formatNumber } from '@/lib/format'
import { checkCounts, entriesText, rowsText } from './import-counts'
import { CheckedRows, PreviewSummary } from './import-preview'
import { useCheckImport, useImportRows, type CheckedRow } from './queries'
import { RecentImports } from './recent-imports'
import { ACCEPT_ATTRIBUTE, ImportFileError, downloadCheckedRows, downloadTemplate, readImportFile, type ImportFile } from './spreadsheet'

/*
  "Import from file" on the Add emissions page: a dialog.

  1. Drop or choose an Excel/CSV file (or download the template: every source
     the company tracks, ready for the amounts). The browser reads it (SheetJS)
     and the API checks every row; nothing is saved yet. Recent imports (with
     Undo) are listed under the drop zone.
  2. The check: what will be saved, or each row's problems (row + column) and
     warnings. Problems block the import until the file is fixed ("Download with
     problems marked" gives it back with a Problems column), or the person
     explicitly skips those rows.
  3. Import: one request, one transaction. A toast links to the entries; if
     rows were skipped, the dialog offers them for download.
*/

type Stage =
  | { kind: 'pick'; error?: string }
  | { kind: 'reading'; fileName: string }
  | { kind: 'checked'; file: ImportFile; rows: CheckedRow[] }
  | { kind: 'skipped'; file: ImportFile; rows: CheckedRow[]; imported: number }

/** `trigger`: the button that opens it (focus returns there when it closes) */
export function ImportDialog({ trigger }: { trigger: ReactNode }) {
  const me = useMe()
  const company = me.company!
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<Stage>({ kind: 'pick' })
  const [confirmSkip, setConfirmSkip] = useState(false)
  const check = useCheckImport()
  const importRows = useImportRows(company.id)
  const busy = stage.kind === 'reading' || importRows.isPending

  function close(next: boolean) {
    if (!next && busy) return // don't lose a file half-way through
    setOpen(next)
    if (!next) setStage({ kind: 'pick' })
  }

  async function openFile(file: File) {
    setStage({ kind: 'reading', fileName: file.name })
    try {
      const read = await readImportFile(file)
      setStage({ kind: 'checked', file: read, rows: await check.mutateAsync(read.rows) })
    } catch (error) {
      setStage({ kind: 'pick', error: error instanceof ImportFileError ? error.message : errorMessage(error) })
    }
  }

  async function template() {
    try {
      const { sources } = await queryClient.fetchQuery(companySourcesQueryOptions(company.id, new Date().getFullYear()))
      await downloadTemplate(sources)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function runImport(file: ImportFile, rows: CheckedRow[], skipInvalid: boolean) {
    try {
      const result = await importRows.mutateAsync({
        fileName: file.fileName,
        rows: file.rows,
        skipInvalid,
        expectedEntries: checkCounts(rows).ready,
      })
      toast.success(`Imported ${entriesText(result.entryCount)} from ${result.fileName}`, {
        action: {
          label: 'View entries',
          onClick: () => void navigate({ to: '/emissions', search: { year: 'all', import: result.id } }),
        },
      })
      if (result.skippedRows > 0) setStage({ kind: 'skipped', file, rows, imported: result.entryCount })
      else close(false)
    } catch (error) {
      toast.error(errorMessage(error))
      // Sources or settings changed since the check: show the new result instead of a stale one
      if (error instanceof ApiRequestError && error.code === 'check_changed') {
        try {
          setStage({ kind: 'checked', file, rows: await check.mutateAsync(file.rows) })
        } catch {
          setStage({ kind: 'pick' })
        }
      }
    }
  }

  const wide = stage.kind === 'checked'
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        // Focus the dialog itself: the first focusable element is the title's (i), whose tip would pop open
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement | null)?.focus()
        }}
        className={cn(
          'flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden p-0',
          wide ? 'sm:max-w-5xl' : 'sm:max-w-2xl',
        )}
      >
        <DialogHeader className="border-b px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-1.5">
            Import from a file
            <InfoTip label="About importing">
              <span>Add many entries at once from an Excel or CSV file, up to {formatNumber(IMPORT_LIMITS.maxRows)} rows.</span>
              <span>Every row is checked before anything is saved. Imported entries go through verification like any other.</span>
            </InfoTip>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Choose an Excel or CSV file; every row is checked before anything is saved.
          </DialogDescription>
        </DialogHeader>

        {stage.kind === 'checked' ? (
          <>
            <Body>
              <PreviewSummary file={stage.file} rows={stage.rows} />
              <CheckedRows file={stage.file} rows={stage.rows} />
            </Body>
            <CheckedFooter
              counts={checkCounts(stage.rows)}
              importing={importRows.isPending}
              onBack={() => setStage({ kind: 'pick' })}
              onDownload={() => void downloadCheckedRows(stage.file, stage.rows, { onlyProblems: false })}
              onImport={() => void runImport(stage.file, stage.rows, false)}
              onSkip={() => setConfirmSkip(true)}
            />
          </>
        ) : stage.kind === 'skipped' ? (
          <>
            <Body>
              <Skipped
                fileName={stage.file.fileName}
                imported={stage.imported}
                skipped={checkCounts(stage.rows).problems}
                onDownload={() => void downloadCheckedRows(stage.file, stage.rows, { onlyProblems: true })}
              />
            </Body>
            <Footer>
              <Button className="rounded-full" onClick={() => close(false)}>
                Done
              </Button>
            </Footer>
          </>
        ) : (
          <Body>
            <DropZone
              busy={stage.kind === 'reading' ? stage.fileName : null}
              error={stage.kind === 'pick' ? stage.error : undefined}
              onFile={(file) => void openFile(file)}
              onTemplate={() => void template()}
            />
            <RecentImports />
          </Body>
        )}

        {stage.kind === 'checked' ? (
          <SkipConfirm
            open={confirmSkip}
            onOpenChange={setConfirmSkip}
            counts={checkCounts(stage.rows)}
            onConfirm={() => void runImport(stage.file, stage.rows, true)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** The dialog's scrolling middle */
function Body({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">{children}</div>
}

function Footer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center justify-end gap-2 border-t px-6 py-4', className)}>{children}</div>
}

/** Pick a file (button or drag and drop); shows the file-level problem, if any */
function DropZone({
  busy,
  error,
  onFile,
  onTemplate,
}: {
  busy: string | null
  error?: string
  onFile: (file: File) => void
  onTemplate: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function drop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file && !busy) onFile(file)
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={cn(
          'flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors motion-reduce:transition-none',
          dragging ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30' : 'bg-muted/20',
          error && !dragging && 'border-destructive/50',
        )}
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-background ring-1 ring-border">
          {busy ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
          ) : (
            <FileSpreadsheet className="size-5 text-muted-foreground" aria-hidden />
          )}
        </span>
        {busy ? (
          <p role="status" className="font-medium">
            Checking {busy}...
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="font-medium">Drop an Excel or CSV file here</p>
              <p className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                Columns: Month, Source, Amount, Unit
                <InfoTip label="About the columns">
                  <span>
                    Required: {IMPORT_COLUMN_LABELS.month}, {IMPORT_COLUMN_LABELS.source}, {IMPORT_COLUMN_LABELS.amount}, and{' '}
                    {IMPORT_COLUMN_LABELS.unit} for sources measured in more than one unit.
                  </span>
                  <span>Optional: {IMPORT_COLUMN_LABELS.dataSource} and {IMPORT_COLUMN_LABELS.notes}. Other columns are ignored.</span>
                  <span>The template already lists your company&apos;s sources with their units: just fill in the amounts.</span>
                </InfoTip>
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button className="rounded-full" onClick={() => input.current?.click()}>
                <Upload aria-hidden />
                Choose file
              </Button>
              <Button variant="outline" className="rounded-full" onClick={onTemplate}>
                <Download aria-hidden />
                Download template
              </Button>
            </div>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          tabIndex={-1}
          aria-label="Spreadsheet to import"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = '' // the same file can be chosen again after fixing it
            if (file) onFile(file)
          }}
        />
      </div>
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  )
}

type Counts = ReturnType<typeof checkCounts>

/** What to do with a checked file: import, or (with problems) download them marked / skip them */
function CheckedFooter({
  counts,
  importing,
  onBack,
  onDownload,
  onImport,
  onSkip,
}: {
  counts: Counts
  importing: boolean
  onBack: () => void
  onDownload: () => void
  onImport: () => void
  onSkip: () => void
}) {
  return (
    <Footer>
      <Button variant="ghost" className="mr-auto rounded-full text-muted-foreground" disabled={importing} onClick={onBack}>
        <ArrowLeft aria-hidden />
        Choose another file
      </Button>
      {counts.problems === 0 ? (
        <Button className="rounded-full" disabled={importing} onClick={onImport}>
          {importing ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Upload aria-hidden />}
          {importing ? 'Importing...' : `Import ${entriesText(counts.ready)}`}
        </Button>
      ) : (
        <>
          {counts.ready > 0 ? (
            <Button variant="outline" className="rounded-full" disabled={importing} onClick={onSkip}>
              {importing ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              Skip {rowsText(counts.problems)}, import {entriesText(counts.ready)}
            </Button>
          ) : null}
          <Button className="rounded-full" disabled={importing} onClick={onDownload}>
            <Download aria-hidden />
            Download with problems marked
          </Button>
        </>
      )}
    </Footer>
  )
}

function SkipConfirm({
  open,
  onOpenChange,
  counts,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  counts: Counts
  onConfirm: () => void
}) {
  const it = counts.problems === 1 ? 'it' : 'them'
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Import {entriesText(counts.ready)} and skip {rowsText(counts.problems)}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The {counts.problems === 1 ? 'row' : 'rows'} with problems won&apos;t be saved. You can download {it} afterwards
            to fix and import later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-full"
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            Import {entriesText(counts.ready)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** After an import that skipped rows: get them back to fix them */
function Skipped({ fileName, imported, skipped, onDownload }: { fileName: string; imported: number; skipped: number; onDownload: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-800">
        <Check className="size-5 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-medium">
          Imported {entriesText(imported)} from {fileName}
        </p>
        <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
          {rowsText(skipped)} skipped. Download {skipped === 1 ? 'it' : 'them'}, fix the problems and import the file.
        </p>
      </div>
      <Button variant="outline" className="rounded-full" onClick={onDownload}>
        <Download aria-hidden />
        Download skipped rows
      </Button>
    </div>
  )
}
