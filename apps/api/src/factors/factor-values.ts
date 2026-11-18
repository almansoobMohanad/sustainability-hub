import { z } from '@hono/zod-openapi'
import { inArray, sql, type Database } from '@hub/db'
import { emissionFactors, factorSets } from '@hub/db/schema'

/*
  "What is the factor for this source, for reporting year Y?"

  Each source + unit takes the value from the factor set of year Y. If that year
  has no value (not published yet, e.g. early in a year, or the UK stopped
  publishing that source), it takes the latest EARLIER year; only if there is
  none, the earliest later one. The year actually used is always returned, so
  the app can say "2025 factors" instead of hiding the fallback.
*/

export const FactorValueSchema = z
  .object({
    unit: z.string().openapi({ example: 'litres' }),
    kgCo2ePerUnit: z.number().openapi({ example: 2.57082 }),
    /** The factor set the value comes from (can differ from the requested year) */
    year: z.number().int(),
  })
  .openapi('FactorValue')

export type FactorValue = z.infer<typeof FactorValueSchema>

/*
  Units in a natural order for people (fuel bills in litres or kWh come first,
  tonnes and GJ later), instead of the alphabetical order the query returns.
*/
const UNIT_ORDER = [
  'kWh',
  'litres',
  'kWh (Gross CV)',
  'kWh (Net CV)',
  'cubic metres',
  'million litres',
  'kg',
  'tonnes',
  'GJ',
  'km',
  'miles',
  'passenger.km',
  'tonne.km',
  'Room per night',
  'per FTE Working Hour',
]
const unitRank = (unit: string) => {
  const rank = UNIT_ORDER.indexOf(unit)
  return rank < 0 ? UNIT_ORDER.length : rank
}

/** Factor values for many sources at once (one query): sourceId -> values, units in display order */
export async function factorValuesFor(db: Database, sourceIds: string[], year: number) {
  const bySource = new Map<string, FactorValue[]>()
  if (sourceIds.length === 0) return bySource

  const rows = await db
    .selectDistinctOn([emissionFactors.sourceId, emissionFactors.unit], {
      sourceId: emissionFactors.sourceId,
      unit: emissionFactors.unit,
      kgCo2ePerUnit: emissionFactors.kgCo2ePerUnit,
      year: factorSets.year,
    })
    .from(emissionFactors)
    .innerJoin(factorSets, sql`${factorSets.id} = ${emissionFactors.factorSetId}`)
    .where(inArray(emissionFactors.sourceId, sourceIds))
    .orderBy(
      emissionFactors.sourceId,
      emissionFactors.unit,
      // Prefer years up to Y, and among those the closest (= latest); then the closest later year
      sql`(${factorSets.year} <= ${year}) desc`,
      sql`abs(${factorSets.year} - ${year})`,
    )

  for (const { sourceId, ...value } of rows) {
    const values = bySource.get(sourceId) ?? []
    values.push(value)
    bySource.set(sourceId, values)
  }
  for (const values of bySource.values()) values.sort((a, b) => unitRank(a.unit) - unitRank(b.unit))
  return bySource
}

/** The units a source has in any year (to validate a chosen default unit) */
export async function unitsFor(db: Database, sourceIds: string[]) {
  const rows = await db
    .selectDistinct({ sourceId: emissionFactors.sourceId, unit: emissionFactors.unit })
    .from(emissionFactors)
    .where(inArray(emissionFactors.sourceId, sourceIds))
  const bySource = new Map<string, Set<string>>()
  for (const row of rows) {
    const units = bySource.get(row.sourceId) ?? new Set<string>()
    units.add(row.unit)
    bySource.set(row.sourceId, units)
  }
  return bySource
}
