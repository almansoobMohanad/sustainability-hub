import { and, eq, inArray, sql, type Database } from '@hub/db'
import { emissionEntries, emissionSources } from '@hub/db/schema'
import type { SedgAutoFigure } from '@hub/shared/sedg'

/*
  The SEDG figures worked out from the company's data. Only VERIFIED entries
  count (a report states figures someone has checked). Reductions compare the
  report year with the company's baseline year, scope by scope, and only when
  the baseline year has verified entries for that scope (otherwise "0 in the
  baseline" would look like a huge increase).

  ONE grouped query covers both years: a handful of rows (year x scope x
  category x disposal method x unit), whatever the number of entries. The
  company + period index serves the date ranges.

  What maps to what:
    E1.1/E1.2/E1.5  all verified entries of scope 1/2/3 (t CO2e)
    E2.1 electricity  "UK electricity" entries in kWh
    E3.1 purchased water  "Water supply" entries (cubic metres or million litres -> litres)
    E4.1  "Waste disposal" entries (tonnes); recycling (open- and closed-loop),
          composting, anaerobic digestion and re-use = diverted from disposal,
          landfill and incineration = directed to disposal
  Nothing else is guessed: heat and steam aren't separated in the factor
  library, and nothing says which waste is hazardous, so E2.1 heating/steam and
  E4.2-E4.4 stay empty for people to fill in.
*/

export type Figure = { value: number | string; note: string }
export type Figures = Partial<Record<SedgAutoFigure, Figure>>

const DIVERTED = new Set(['open-loop', 'closed-loop', 'composting', 'anaerobic digestion', 're-use'])
const DISPOSED = new Set(['landfill', 'incineration with energy recovery', 'combustion'])
const LITRES_PER_UNIT: Record<string, number> = { 'cubic metres': 1000, 'million litres': 1_000_000 }

type YearTotals = {
  co2e: Record<1 | 2 | 3, number>
  entries: Record<1 | 2 | 3, number>
  electricityKwh: number
  electricityEntries: number
  waterLitres: number
  waterEntries: number
  waste: { generated: number; diverted: number; disposed: number; entries: number }
}

const emptyTotals = (): YearTotals => ({
  co2e: { 1: 0, 2: 0, 3: 0 },
  entries: { 1: 0, 2: 0, 3: 0 },
  electricityKwh: 0,
  electricityEntries: 0,
  waterLitres: 0,
  waterEntries: 0,
  waste: { generated: 0, diverted: 0, disposed: 0, entries: 0 },
})

/** Numbers without floating-point noise (0.30000000000000004 -> 0.3) */
const tidy = (value: number) => Math.round(value * 1000) / 1000
const format = (value: number, digits = 2) => value.toLocaleString('en-GB', { maximumFractionDigits: digits })
const entriesText = (count: number) => (count === 1 ? '1 verified entry' : `${format(count, 0)} verified entries`)

async function verifiedTotals(db: Database, companyId: string, years: number[]) {
  const method = sql<string>`lower(${emissionSources.path}[array_length(${emissionSources.path}, 1)])`
  const rows = await db
    .select({
      year: emissionEntries.reportingYear,
      scope: emissionEntries.scope,
      category: emissionSources.category,
      method,
      unit: emissionEntries.unit,
      amount: sql<number>`sum(${emissionEntries.amount})`.mapWith(Number),
      kg: sql<number>`sum(${emissionEntries.co2eKg})`.mapWith(Number),
      entries: sql<number>`count(*)`.mapWith(Number),
    })
    .from(emissionEntries)
    .innerJoin(emissionSources, eq(emissionSources.id, emissionEntries.sourceId))
    .where(
      and(
        eq(emissionEntries.organizationId, companyId),
        eq(emissionEntries.status, 'verified'),
        inArray(emissionEntries.reportingYear, years),
        // The same years as a date range, so the company + period index is used
        sql`${emissionEntries.periodStart} >= ${`${Math.min(...years)}-01-01`}::date`,
        sql`${emissionEntries.periodStart} < ${`${Math.max(...years) + 1}-01-01`}::date`,
      ),
    )
    .groupBy(emissionEntries.reportingYear, emissionEntries.scope, emissionSources.category, sql`4`, emissionEntries.unit)

  const totals = new Map(years.map((year) => [year, emptyTotals()]))
  for (const row of rows) {
    const year = totals.get(row.year)
    if (!year) continue
    const scope = row.scope as 1 | 2 | 3
    year.co2e[scope] += row.kg / 1000
    year.entries[scope] += row.entries
    if (row.category === 'UK electricity' && row.unit === 'kWh') {
      year.electricityKwh += row.amount
      year.electricityEntries += row.entries
    }
    if (row.category === 'Water supply' && LITRES_PER_UNIT[row.unit]) {
      year.waterLitres += row.amount * LITRES_PER_UNIT[row.unit]!
      year.waterEntries += row.entries
    }
    if (row.category === 'Waste disposal' && row.unit === 'tonnes') {
      year.waste.generated += row.amount
      year.waste.entries += row.entries
      if (DIVERTED.has(row.method)) year.waste.diverted += row.amount
      else if (DISPOSED.has(row.method)) year.waste.disposed += row.amount
    }
  }
  return totals
}

export async function sedgFigures(
  db: Database,
  { companyId, companyName, year, baselineYear }: { companyId: string; companyName: string; year: number; baselineYear: number | null },
): Promise<Figures> {
  // A baseline only means something when it's an earlier year
  const baseline = baselineYear !== null && baselineYear < year ? baselineYear : null
  const totals = await verifiedTotals(db, companyId, baseline === null ? [year] : [year, baseline])
  const now = totals.get(year)!
  const before = baseline === null ? null : totals.get(baseline)!

  const figures: Figures = {
    companyName: { value: companyName, note: 'Your company name' },
    disclosureDate: {
      value: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      note: "Today's date",
    },
    disclosurePeriod: { value: `1 January ${year} to 31 December ${year}`, note: 'The calendar year' },
  }

  const scopes = [
    [1, 'scope1', 'scope1Reduction'],
    [2, 'scope2', 'scope2Reduction'],
    [3, 'scope3', 'scope3Reduction'],
  ] as const
  for (const [scope, total, reduction] of scopes) {
    if (now.entries[scope] > 0) {
      figures[total] = { value: tidy(now.co2e[scope]), note: `From ${entriesText(now.entries[scope])}` }
    }
    if (before && before.entries[scope] > 0) {
      figures[reduction] = {
        value: tidy(before.co2e[scope] - now.co2e[scope]),
        note: `${baseline}: ${format(before.co2e[scope])} t, ${year}: ${format(now.co2e[scope])} t (verified entries)`,
      }
    }
  }

  if (now.electricityEntries > 0) {
    figures.electricity = { value: tidy(now.electricityKwh), note: `From ${entriesText(now.electricityEntries)}` }
  }
  if (before && before.electricityEntries > 0) {
    figures.electricityReduction = {
      value: tidy(before.electricityKwh - now.electricityKwh),
      note: `${baseline}: ${format(before.electricityKwh, 0)} kWh, ${year}: ${format(now.electricityKwh, 0)} kWh (electricity entries)`,
    }
  }

  if (now.waterEntries > 0) {
    figures.purchasedWater = { value: tidy(now.waterLitres), note: `From ${entriesText(now.waterEntries)}` }
  }
  if (before && before.waterEntries > 0) {
    figures.waterReduction = {
      value: tidy(before.waterLitres - now.waterLitres),
      note: `${baseline}: ${format(before.waterLitres, 0)} litres, ${year}: ${format(now.waterLitres, 0)} litres (water supply entries)`,
    }
  }

  if (now.waste.entries > 0) {
    const note = `From ${entriesText(now.waste.entries)}`
    figures.wasteGenerated = { value: tidy(now.waste.generated), note }
    figures.wasteDiverted = { value: tidy(now.waste.diverted), note: 'Recycling, composting, anaerobic digestion and re-use entries' }
    figures.wasteDisposed = { value: tidy(now.waste.disposed), note: 'Landfill and incineration entries' }
  }

  return figures
}

/**
 * E1.7: Scope 1 and 2 emissions per MYR 1 million of revenue, from the values
 * the report shows (entered or calculated) and the revenue entered under
 * General information.
 */
export function intensityFigure(scope1: number | undefined, scope2: number | undefined, revenue: number | undefined) {
  // One of the two may be missing (e.g. no Scope 2 at all); with neither there is nothing to divide
  if ((scope1 === undefined && scope2 === undefined) || !revenue || revenue <= 0) return undefined
  const value = ((scope1 ?? 0) + (scope2 ?? 0)) / (revenue / 1_000_000)
  return { value: Math.round(value * 10_000) / 10_000, note: `(E1.1 + E1.2) / MYR ${format(revenue / 1_000_000, 3)} million revenue` }
}
