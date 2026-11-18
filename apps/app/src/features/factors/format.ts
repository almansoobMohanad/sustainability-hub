/** Display helpers for emission factors. */

/** 3104.16462 -> "3,104.16", 0.13096 -> "0.13096" (enough digits for small factors, not too many for big ones) */
export function formatFactor(kgCo2ePerUnit: number) {
  return kgCo2ePerUnit.toLocaleString('en', { maximumSignificantDigits: 6 })
}

/** The UK units are plural or technical; "per ..." reads better with these */
const PER_UNIT: Record<string, string> = {
  litres: 'litre',
  tonnes: 'tonne',
  'cubic metres': 'cubic metre',
  'million litres': 'million litres',
  miles: 'mile',
  'passenger.km': 'passenger km',
  'tonne.km': 'tonne km',
  'Room per night': 'room night',
  'per FTE Working Hour': 'FTE working hour',
}

/** "litres" -> "kg CO2e per litre" */
export function perUnit(unit: string) {
  return `kg CO2e per ${PER_UNIT[unit] ?? unit}`
}

/** Unit as a short label for lists: "per FTE Working Hour" -> "FTE working hours" */
export function unitLabel(unit: string) {
  if (unit === 'per FTE Working Hour') return 'FTE working hours'
  if (unit === 'Room per night') return 'room nights'
  return unit.replace('.km', ' km')
}

/**
 * The years people can pick: from the library's first year to this year
 * (newest first). Years without their own factor set (e.g. this year before the
 * UK publishes it) use the latest earlier set, and the page says so.
 */
export function selectableYears(libraryYears: number[], now = new Date()) {
  const first = Math.min(...libraryYears, now.getFullYear())
  const last = Math.max(now.getFullYear(), ...libraryYears)
  return Array.from({ length: last - first + 1 }, (_, index) => last - index)
}
