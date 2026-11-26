import type { SedgField, SedgLevel, SedgPillar, SedgValue } from '@hub/shared/sedg'

/*
  The colours of the official SEDG v2 data template (read from its cells):
  each pillar has one hue, darkest for Basic and lighter for Intermediate and
  Advanced; the general information header is navy. The PDF uses them as in
  the template; the page uses them only as small marks next to the level, so
  text keeps its normal colours (contrast).
*/
export const SEDG_COLORS: Record<SedgPillar, Record<SedgLevel, string>> = {
  environmental: { basic: '#387836', intermediate: '#60925E', advanced: '#87AD85' },
  social: { basic: '#AE1B1F', intermediate: '#D47C7F', advanced: '#DF9FA1' },
  governance: { basic: '#165CA1', intermediate: '#457DB4', advanced: '#739CC6' },
}

export const SEDG_GENERAL_COLORS = { header: '#002060', label: '#F2F2F2' }

/** How a stored or calculated value reads (on the page, outside inputs, and in the PDF) */
export function formatSedgValue(field: SedgField, value: SedgValue | undefined) {
  if (value === undefined || value === '') return ''
  if (typeof value === 'string') return value
  switch (field.kind) {
    case 'percent':
      return `${value.toLocaleString('en-GB', { maximumFractionDigits: 2 })}%`
    case 'year':
      return String(value)
    case 'count':
      return value.toLocaleString('en-GB')
    default:
      return value.toLocaleString('en-GB', { maximumFractionDigits: 3 })
  }
}

/** The unit shown next to a field ("%" for percentages, nothing for counts and text) */
export function unitOf(field: SedgField) {
  if (field.kind === 'percent') return '%'
  return field.unit ?? ''
}

/** A value as it goes into an input (no thousands separators, so it can be edited and parsed) */
export const inputText = (value: SedgValue | undefined) => (value === undefined ? '' : String(value))
