import { useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { Button } from '@hub/ui/components/button'
import { Input } from '@hub/ui/components/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hub/ui/components/select'
import { cn } from '@hub/ui/lib/utils'
import {
  isAsked,
  parseEsgValue,
  type EsgAnswers,
  type EsgAutoValue,
  type EsgField,
  type EsgQuestion as Question,
  type EsgValue,
} from '@hub/shared/esg-ready'

/*
  One ESG Ready question: its number, the question, and its answers. The page
  owns the answers (so the score and progress update as people click); text
  fields keep what's being typed themselves and pass on valid text only.

    choice  the statements as a list of options (native radio buttons)
    multi   checkboxes; "None of the above" and the others exclude each other
    select  a dropdown (states, sub-sectors)
    text    one line; the company name and email start filled in
*/

type Props = {
  question: Question
  answers: Partial<EsgAnswers>
  automatic: Partial<Record<EsgAutoValue, { value: string; note: string }>>
  answered: boolean
  onChange: (key: string, value: EsgValue | null) => void
  onDiscard: (key: string) => void
  onBlur: () => void
}

export function EsgQuestion({ question, answers, automatic, answered, onChange, onDiscard, onBlur }: Props) {
  const titleId = `esg-q${question.number}`
  const fields = question.fields.filter((field) => isAsked(field.showIf, answers))
  return (
    <section aria-labelledby={titleId} className="grid gap-x-8 gap-y-3 py-6 sm:grid-cols-[3.5rem_minmax(0,1fr)]">
      <div className="flex items-center gap-1.5 self-start text-sm font-semibold text-muted-foreground tabular-nums">
        Q{question.number}
        {answered ? <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-label="Answered" /> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <h4 id={titleId} className="text-[0.9375rem] leading-snug font-medium">
          {question.title}
        </h4>
        {fields.map((field) => (
          <Field
            key={field.key}
            field={field}
            labelledBy={field.label ? undefined : titleId}
            value={answers[field.key]}
            automatic={field.auto ? automatic[field.auto] : undefined}
            onChange={onChange}
            onDiscard={onDiscard}
            onBlur={onBlur}
          />
        ))}
      </div>
    </section>
  )
}

type FieldProps = {
  field: EsgField
  /** The question's heading names single-field questions */
  labelledBy?: string
  value: EsgValue | undefined
  automatic?: { value: string; note: string }
  onChange: Props['onChange']
  onDiscard: Props['onDiscard']
  onBlur: Props['onBlur']
}

function Field(props: FieldProps) {
  switch (props.field.kind) {
    case 'choice':
      return <ChoiceField {...props} />
    case 'multi':
      return <MultiField {...props} />
    case 'select':
      return <SelectField {...props} />
    default:
      return <TextField {...props} />
  }
}

const OPTION =
  'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed transition-colors hover:bg-muted/40 has-checked:border-emerald-600 has-checked:bg-emerald-50/60 has-focus-visible:ring-3 has-focus-visible:ring-ring/50 motion-reduce:transition-none dark:has-checked:border-emerald-400 dark:has-checked:bg-emerald-950/30'
const MARK = 'mt-0.5 size-4 shrink-0 accent-emerald-600 dark:accent-emerald-400'

function ChoiceField({ field, labelledBy, value, onChange }: FieldProps) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" aria-labelledby={labelledBy}>
      {field.label ? <legend className="mb-1 text-sm font-medium">{field.label}</legend> : null}
      {field.options!.map((option) => (
        <label key={option.id} className={OPTION}>
          <input
            type="radio"
            name={field.key}
            value={option.id}
            className={MARK}
            checked={value === option.id}
            onChange={() => onChange(field.key, option.id)}
          />
          <span>{option.label}</span>
        </label>
      ))}
      {value !== undefined ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto w-fit p-0 text-xs text-muted-foreground"
          onClick={() => onChange(field.key, null)}
        >
          Clear answer
        </Button>
      ) : null}
    </fieldset>
  )
}

function MultiField({ field, labelledBy, value, onChange }: FieldProps) {
  const chosen = Array.isArray(value) ? value : []
  function toggle(id: string, on: boolean) {
    let next = on ? [...chosen, id] : chosen.filter((item) => item !== id)
    // "None of the above" can't be combined with the others: choosing one clears the other kind
    if (on && field.exclusive) next = id === field.exclusive ? [id] : next.filter((item) => item !== field.exclusive)
    const ordered = field.options!.map((option) => option.id).filter((option) => next.includes(option))
    onChange(field.key, ordered.length > 0 ? ordered : null)
  }
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" aria-labelledby={labelledBy}>
      {field.label ? <legend className="mb-1 text-sm font-medium">{field.label}</legend> : null}
      <span className="text-xs text-muted-foreground">Choose all that apply.</span>
      <div className="grid gap-2 sm:grid-cols-2">
        {field.options!.map((option) => (
          <label key={option.id} className={cn(OPTION, 'py-2.5')}>
            <input
              type="checkbox"
              className={MARK}
              checked={chosen.includes(option.id)}
              onChange={(event) => toggle(option.id, event.target.checked)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function SelectField({ field, labelledBy, value, onChange }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      {field.label ? <span className="text-sm font-medium">{field.label}</span> : null}
      <Select value={typeof value === 'string' ? value : ''} onValueChange={(next) => onChange(field.key, next)}>
        <SelectTrigger aria-labelledby={labelledBy} aria-label={field.label} className="w-full data-[size=default]:h-10 sm:max-w-sm">
          <SelectValue placeholder="Choose one" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {field.options!.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function TextField({ field, labelledBy, value, automatic, onChange, onDiscard, onBlur }: FieldProps) {
  // Starts with the stored text, or the company's name / the person's email until someone types their own
  const [text, setText] = useState(() => (typeof value === 'string' ? value : (automatic?.value ?? '')))
  const [error, setError] = useState<string | null>(null)
  const id = `esg-${field.key}`

  function update(next: string) {
    setText(next)
    if (next.trim() === '') {
      setError(null)
      if (value !== undefined) onChange(field.key, null)
      else onDiscard(field.key)
      return
    }
    const parsed = parseEsgValue(field, next)
    if ('error' in parsed) {
      setError(parsed.error)
      onDiscard(field.key)
      return
    }
    setError(null)
    onChange(field.key, parsed.value)
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {field.label ? (
        <label htmlFor={id} className="text-sm font-medium">
          {field.label}
        </label>
      ) : null}
      <Input
        id={id}
        value={text}
        autoComplete="off"
        className="h-10 w-full sm:max-w-sm"
        aria-labelledby={field.label ? undefined : labelledBy}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => update(event.target.value)}
        onBlur={onBlur}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : automatic && value === undefined ? (
        <p className="text-xs text-muted-foreground">{automatic.note}, filled in for you</p>
      ) : null}
    </div>
  )
}
