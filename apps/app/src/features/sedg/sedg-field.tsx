import { useRef, useState, type FormEvent } from 'react'
import { Calculator } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import { Input } from '@hub/ui/components/input'
import { Textarea } from '@hub/ui/components/textarea'
import { cn } from '@hub/ui/lib/utils'
import { parseSedgValue, type SedgField as Field, type SedgValue } from '@hub/shared/sedg'
import type { SedgFigure } from './queries'
import { formatSedgValue, inputText, unitOf } from './style'

/*
  One SEDG field. It keeps what's being typed itself (so saving never moves the
  cursor), checks it with the same rule as the API (parseSedgValue) and hands
  valid values to the autosave; invalid ones show an error and aren't saved.

  A field with a calculated figure (from verified entries) shows that figure
  until someone chooses "Enter my own"; their value then wins, and "Use the
  calculated figure" removes it again. Clearing the input does the same.
*/

const textareaGrowsByItself = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')
function growTextarea(event: FormEvent<HTMLTextAreaElement>) {
  if (textareaGrowsByItself) return
  const textarea = event.currentTarget
  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight + 2}px`
}

type Props = {
  field: Field
  /** What's stored (entered by someone), if anything */
  stored: SedgValue | undefined
  /** The calculated figure, if the field has one and there's data for it */
  figure: SedgFigure | undefined
  onChange: (key: string, value: SedgValue | null) => void
  onDiscard: (key: string) => void
  onBlur: () => void
}

export function SedgFieldInput({ field, stored, figure, onChange, onDiscard, onBlur }: Props) {
  const [text, setText] = useState(() => inputText(stored))
  const [error, setError] = useState<string | null>(null)
  // "Enter my own" over a calculated figure, before anything is stored
  const [ownFigure, setOwnFigure] = useState(false)
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const id = `sedg-${field.key}`
  const unit = unitOf(field)
  const showsFigure = figure !== undefined && stored === undefined && !ownFigure

  function update(next: string) {
    setText(next)
    if (next.trim() === '') {
      setError(null)
      // An empty field stores nothing (and a calculated figure shows again)
      if (stored !== undefined) onChange(field.key, null)
      else onDiscard(field.key)
      return
    }
    const parsed = parseSedgValue(field, next)
    if ('error' in parsed) {
      setError(parsed.error)
      onDiscard(field.key)
      return
    }
    setError(null)
    onChange(field.key, parsed.value)
  }

  function enterOwn() {
    setOwnFigure(true)
    setText(inputText(figure?.value))
    requestAnimationFrame(() => inputRef.current?.select())
  }

  function backToCalculated() {
    setOwnFigure(false)
    setText('')
    setError(null)
    if (stored !== undefined) onChange(field.key, null)
    else onDiscard(field.key)
  }

  function leave() {
    // Left empty after "Enter my own": back to the calculated figure
    if (text.trim() === '' && stored === undefined) setOwnFigure(false)
    onBlur()
  }

  const describedBy = error ? `${id}-error` : figure ? `${id}-figure` : undefined

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', field.kind === 'list' && 'sm:col-span-2')}>
      <label htmlFor={showsFigure ? undefined : id} className="text-sm font-medium">
        {field.label}
      </label>

      {showsFigure ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed bg-muted/40 px-3 py-2">
            <span className="text-sm font-semibold tabular-nums">
              {formatSedgValue(field, figure.value)}
              {unit && field.kind !== 'percent' ? <span className="ml-1 font-normal text-muted-foreground">{unit}</span> : null}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
              <Calculator className="size-3" aria-hidden />
              Calculated
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span id={`${id}-figure`} className="text-xs text-muted-foreground">
              {figure.note}
            </span>
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={enterOwn}>
              Enter my own
            </Button>
          </div>
        </div>
      ) : (
        <>
          {field.kind === 'list' ? (
            <Textarea
              ref={inputRef}
              id={id}
              value={text}
              rows={2}
              className="max-h-60 min-h-20 resize-none"
              aria-invalid={Boolean(error)}
              aria-describedby={describedBy}
              onInput={growTextarea}
              onChange={(event) => update(event.target.value)}
              onBlur={leave}
            />
          ) : (
            <div className={cn('flex w-full', field.kind !== 'text' && 'max-w-xs')}>
              <Input
                ref={inputRef}
                id={id}
                value={text}
                // Text inputs for numbers: no spinners, and "1e3" or a pasted "12,5" get a clear message
                inputMode={field.kind === 'text' ? undefined : field.kind === 'quantity' || field.kind === 'percent' ? 'decimal' : 'numeric'}
                autoComplete="off"
                className={cn('h-10 min-w-0', unit && 'rounded-r-none tabular-nums')}
                aria-invalid={Boolean(error)}
                aria-describedby={describedBy}
                onChange={(event) => update(event.target.value)}
                onBlur={leave}
              />
              {unit ? (
                <span className="inline-flex h-10 max-w-48 shrink-0 items-center truncate rounded-r-md border border-l-0 bg-muted/50 px-3 text-sm text-muted-foreground">
                  {unit}
                </span>
              ) : null}
            </div>
          )}
          {error ? (
            <p id={`${id}-error`} className="text-sm text-destructive">
              {error}
            </p>
          ) : figure ? (
            <p id={`${id}-figure`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>
                Calculated: {formatSedgValue(field, figure.value)}
                {unit && field.kind !== 'percent' ? ` ${unit}` : ''}
              </span>
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={backToCalculated}>
                Use the calculated figure
              </Button>
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
