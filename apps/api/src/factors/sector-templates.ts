import { and, eq, inArray, UK_FACTOR_LIBRARY, type Database } from '@hub/db'
import { emissionSources } from '@hub/db/schema'
import type { Sector } from '@hub/shared/sectors'

/*
  Sector templates: the emission sources suggested when a company is created.
  People adjust the list before confirming, and change it any time on the
  Emission sources page, so a template is a sensible starting point, not a rule.

  Keys refer to sources in the UK factor library (packages/db/seed/uk-ghg/
  sources.json, lower case). A key that doesn't exist is reported at API
  startup (checkSectorTemplates) and skipped.

  Choices worth knowing:
  - A company's OWN vehicles and generators are counted from the fuel bought
    (litres of diesel/petrol), which is the most accurate and matches receipts.
    Distance-based vehicle sources are left out on purpose: tracking the same
    lorry by litres AND by km would count its emissions twice. Distance is used
    only for freight sent with other companies (Scope 3, tonne.km).
  - Each item has the unit offered first when entering data (people can pick
    any unit the source has).
*/

type TemplateItem = { key: string; unit: string }

const SOURCES = {
  // Scope 1: fuels burned on site and in company vehicles
  naturalGas: { key: '1 > fuels > gaseous fuels > natural gas', unit: 'kWh (Gross CV)' },
  lpg: { key: '1 > fuels > gaseous fuels > lpg', unit: 'litres' },
  diesel: { key: '1 > fuels > liquid fuels > diesel (average biofuel blend)', unit: 'litres' },
  petrol: { key: '1 > fuels > liquid fuels > petrol (average biofuel blend)', unit: 'litres' },
  gasOil: { key: '1 > fuels > liquid fuels > gas oil', unit: 'litres' },
  fuelOil: { key: '1 > fuels > liquid fuels > fuel oil', unit: 'litres' },
  // Scope 1: refrigerant leaks (air conditioning, chillers, cold rooms, refrigerated trucks)
  r410a: { key: '1 > refrigerant & other > blends > r410a', unit: 'kg' },
  r404a: { key: '1 > refrigerant & other > blends > r404a', unit: 'kg' },
  r407c: { key: '1 > refrigerant & other > blends > r407c', unit: 'kg' },
  hfc134a: { key: '1 > refrigerant & other > kyoto protocol products > hfc-134a', unit: 'kg' },
  // Scope 2: purchased electricity
  electricity: { key: '2 > uk electricity > electricity generated > electricity: uk', unit: 'kWh' },
  // Scope 3: water
  water: { key: '3 > water supply', unit: 'cubic metres' },
  waterTreatment: { key: '3 > water treatment', unit: 'cubic metres' },
  // Scope 3: waste
  wasteGeneral: { key: '3 > waste disposal > refuse > commercial and industrial waste > landfill', unit: 'tonnes' },
  wastePaperRecycled: { key: '3 > waste disposal > paper > paper and board: mixed > closed-loop', unit: 'tonnes' },
  wastePlasticsLandfill: { key: '3 > waste disposal > plastic > plastics: average plastics > landfill', unit: 'tonnes' },
  wastePlasticsRecycled: { key: '3 > waste disposal > plastic > plastics: average plastics > closed-loop', unit: 'tonnes' },
  wasteMetalRecycled: { key: '3 > waste disposal > metal > metal: scrap metal > closed-loop', unit: 'tonnes' },
  wasteFoodLandfill: { key: '3 > waste disposal > refuse > organic: food and drink waste > landfill', unit: 'tonnes' },
  wasteFoodComposting: { key: '3 > waste disposal > refuse > organic: food and drink waste > composting', unit: 'tonnes' },
  wasteConstruction: { key: '3 > waste disposal > construction > average construction > closed-loop', unit: 'tonnes' },
  // Scope 3: business travel (employees' own cars, flights, public transport, hotels, homeworking)
  travelCar: { key: '3 > business travel- land > cars (by size) > average car > unknown', unit: 'km' },
  travelFlights: {
    key: '3 > business travel- air > flights > international, to/from non-uk > average passenger > with rf',
    unit: 'passenger.km',
  },
  travelRail: { key: '3 > business travel- land > rail > national rail', unit: 'passenger.km' },
  travelTaxi: { key: '3 > business travel- land > taxis > regular taxi', unit: 'km' },
  hotel: { key: '3 > hotel stay > malaysia', unit: 'Room per night' },
  homeworking: { key: '3 > homeworking > homeworking (office equipment + heating)', unit: 'per FTE Working Hour' },
  // Scope 3: freight sent with other companies
  freightHgv: {
    key: '3 > freighting goods > hgv (non-refrigerated, all diesel) > average non-refrigerated hgvs > average laden',
    unit: 'tonne.km',
  },
  freightVan: { key: '3 > freighting goods > vans > average (up to 3.5 tonnes) > diesel', unit: 'tonne.km' },
  freightShip: { key: '3 > freighting goods > cargo ship > container ship > average', unit: 'tonne.km' },
  freightAir: { key: '3 > freighting goods > freight flights > international, to/from non-uk > with rf', unit: 'tonne.km' },
  // Scope 3: purchased materials
  concrete: { key: '3 > material use > construction > concrete > primary material production', unit: 'tonnes' },
  metals: { key: '3 > material use > construction > metals > primary material production', unit: 'tonnes' },
  aggregates: { key: '3 > material use > construction > aggregates > primary material production', unit: 'tonnes' },
  wood: { key: '3 > material use > construction > wood > primary material production', unit: 'tonnes' },
  plastics: { key: '3 > material use > plastic > plastics: average plastics > primary material production', unit: 'tonnes' },
} satisfies Record<string, TemplateItem>

const S = SOURCES
/** Almost every organisation has these */
const BASE = [S.electricity, S.r410a, S.water, S.wasteGeneral, S.wastePaperRecycled, S.travelCar, S.travelFlights]

export const SECTOR_TEMPLATES: Record<Sector, TemplateItem[]> = {
  manufacturing: [
    ...BASE,
    S.naturalGas, S.diesel, S.lpg, S.fuelOil, S.hfc134a, S.r407c,
    S.waterTreatment, S.wastePlasticsLandfill, S.wasteMetalRecycled, S.plastics, S.freightHgv,
  ],
  logistics: [...BASE, S.diesel, S.petrol, S.r404a, S.freightHgv, S.freightShip, S.freightAir],
  office: [...BASE, S.petrol, S.travelRail, S.travelTaxi, S.hotel, S.homeworking],
  construction: [
    ...BASE,
    S.diesel, S.gasOil, S.petrol, S.concrete, S.metals, S.aggregates, S.wood, S.wasteConstruction, S.freightHgv,
  ],
  retail: [
    ...BASE,
    S.naturalGas, S.diesel, S.r404a, S.hfc134a, S.wastePlasticsRecycled, S.wasteFoodLandfill, S.freightVan,
  ],
  hospitality: [
    ...BASE,
    S.naturalGas, S.lpg, S.r404a, S.hfc134a, S.waterTreatment, S.wasteFoodLandfill, S.wasteFoodComposting,
  ],
  agriculture: [
    S.electricity, S.diesel, S.gasOil, S.petrol, S.lpg, S.r404a,
    S.water, S.wasteGeneral, S.wastePlasticsLandfill, S.freightHgv,
  ],
  other: BASE,
}

export type ResolvedTemplateItem = { sourceId: string; defaultUnit: string }

let resolved: Promise<{ templates: Record<Sector, ResolvedTemplateItem[]>; missingKeys: string[] }> | undefined

/**
 * Template keys -> source ids (looked up once, then kept in memory: the
 * library only changes when the API restarts with new seed files).
 */
export function resolveSectorTemplates(db: Database) {
  resolved ??= (async () => {
    const keys = [...new Set(Object.values(SECTOR_TEMPLATES).flat().map((item) => item.key))]
    const rows = await db
      .select({ id: emissionSources.id, key: emissionSources.key })
      .from(emissionSources)
      .where(and(eq(emissionSources.libraryCode, UK_FACTOR_LIBRARY), inArray(emissionSources.key, keys)))
    const idByKey = new Map(rows.map((row) => [row.key, row.id]))
    const templates = Object.fromEntries(
      Object.entries(SECTOR_TEMPLATES).map(([sector, items]) => [
        sector,
        items.flatMap((item) => {
          const sourceId = idByKey.get(item.key)
          return sourceId ? [{ sourceId, defaultUnit: item.unit }] : []
        }),
      ]),
    ) as Record<Sector, ResolvedTemplateItem[]>
    return { templates, missingKeys: keys.filter((key) => !idByKey.has(key)) }
  })()
  // Don't cache a failure (e.g. the database was briefly unreachable)
  resolved.catch(() => {
    resolved = undefined
  })
  return resolved
}

/** Called at startup: a typo or a library change shows up in the log immediately. */
export async function checkSectorTemplates(db: Database) {
  const { missingKeys } = await resolveSectorTemplates(db)
  for (const key of missingKeys) console.warn(`Sector templates: no source "${key}" in the factor library (skipped).`)
}
