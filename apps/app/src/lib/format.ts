/** Formatting helpers shared across the app. */

/** kg CO2e -> tonnes CO2e, e.g. 12_345 -> "12.3". */
export function formatTonnes(kg: number, fractionDigits = 1) {
  return (kg / 1000).toLocaleString('en', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

/** Plain number with thousands separators, e.g. 42000.5 -> "42,000.5". */
export function formatNumber(value: number, maxFractionDigits = 2) {
  return value.toLocaleString('en', { maximumFractionDigits: maxFractionDigits })
}

/** "2026-03" -> "Mar 2026". */
export function formatPeriod(period: string, month: 'short' | 'long' = 'short') {
  const [year, m] = period.split('-').map(Number)
  return new Date(year, m - 1, 1).toLocaleString('en', { month, year: 'numeric' })
}

/** Short month name for a 0-based month index, e.g. 2 -> "Mar". */
export function monthName(index: number) {
  return new Date(2000, index, 1).toLocaleString('en', { month: 'short' })
}

/** Current month as "YYYY-MM". */
export function currentPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
