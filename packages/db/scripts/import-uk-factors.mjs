#!/usr/bin/env node
/*
  Converts the UK Government GHG Conversion Factors (the official "flat file"
  spreadsheets, one per year) into the seed files in seed/uk-ghg/, which the
  API loads into the database on startup (see src/factor-library.ts).

  Run it only when adding a new year or when the UK publishes a corrected file:
    1. add/replace the year's entry in SETS below (the link is on
       https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting,
       choose the "flat file / flat format" spreadsheet)
    2. pnpm --filter @hub/db factors:import
    3. read the continuity report it prints: a source that "disappears" in the
       new year is usually a rename; add it to the RENAMES tables so the
       source keeps one identity across years, and run it again
    4. commit seed/uk-ghg/ (the API picks the new data up on its next start)

  Never edit the generated files by hand.

  Licence: the factors are Crown copyright, published under the Open Government
  Licence v3.0 (attribution in CREDITS.md and in each factor set's record).
*/
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'

const SETS = [
  { year: 2019, version: 'v1.2', url: 'https://assets.publishing.service.gov.uk/media/5f1ff1cc8fa8f50485f30666/conversion-factors-2019-flat-file-v01-02.xls' },
  { year: 2020, version: 'v1.0', url: 'https://assets.publishing.service.gov.uk/media/5edfa176d3bf7f1eb2043f01/Conversion_Factors_2020_-_Flat_file__for_automatic_processing_only_.xlsx' },
  { year: 2021, version: 'v1.0', url: 'https://assets.publishing.service.gov.uk/media/61ee74c88fa8f505960134ec/conversion-factors-2021-flat-file-automatic-processing.xls' },
  { year: 2022, version: 'v1.0', url: 'https://assets.publishing.service.gov.uk/media/6329dcf2e90e073725585d5c/ghg-conversion-factors-2022-flat-format.xls' },
  { year: 2023, version: 'update', url: 'https://assets.publishing.service.gov.uk/media/649c536906179b00113f74a9/ghg-conversion-factors-2023-flat-file-update.xlsx' },
  { year: 2024, version: 'v1.1', url: 'https://assets.publishing.service.gov.uk/media/6722567c10b0d582ee8c4953/ghg-conversion-factors-2024-FlatFormat_v1_1.xlsx' },
  { year: 2025, version: 'v1.0', url: 'https://assets.publishing.service.gov.uk/media/6846b6ea57f3515d9611f0dd/ghg-conversion-factors-2025-flat-format.xlsx' },
  { year: 2026, version: 'revised', url: 'https://assets.publishing.service.gov.uk/media/6a6c9748862aaf18d9c62ac9/ghg-conversion-factors-2026-flat-format-revised.xlsx' },
]

const PUBLISHER = 'UK Government (DESNZ / Defra)'
const TITLE = 'UK Government GHG Conversion Factors for Company Reporting'
const LICENCE = 'Open Government Licence v3.0'
const LICENCE_URL = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'

/*
  Renames between years, old name -> newest name, so a source keeps ONE key
  across all years (otherwise e.g. a company tracking "HGV (all diesel)" would
  have no factor from 2026, when the UK renamed it). Found with the continuity
  report; extend when a new year renames things.
*/
const RENAMES = {
  // Level 1 (category)
  level1: {
    'UK electricity for Evs': 'UK electricity for EVs',
    'WTT- business travel (air)': 'WTT- business travel- air',
    'WTT- business travel (sea)': 'WTT- business travel- sea',
    'WTT- pass vehs & travel (land)': 'WTT- pass vehs & travel- land',
    'WTT- UK & overseas elec': 'WTT- UK electricity',
  },
  // Level 2 (any category)
  level2: {
    'Kyoto protocol - standard': 'Kyoto protocol products',
    'Kyoto protocol- blends': 'Blends',
    'Montreal protocol - standard': 'Montreal protocol products',
    'Montreal protocol - blends': 'Blends',
    'Other perfluorinated gases': 'Kyoto protocol products', // NF3 and PFCs moved there in 2022
    'Other refrigerants': 'Other products',
    'WTT- gaseous fuels': 'Gaseous fuels',
    'WTT- liquid fuels': 'Liquid fuels',
    'WTT- solid fuels': 'Solid fuels',
    'UK electricity generated (managed assets)': 'Electricity generated',
    'HGV (all diesel)': 'HGV (non-refrigerated, all diesel)',
    'HGVs refrigerated (all diesel)': 'HGV (refrigerated, all diesel)',
    'HGV refrigerated (all diesel)': 'HGV (refrigerated, all diesel)',
    'WTT- HGV (all diesel)': 'WTT- HGV (non-refrigerated, all diesel)',
    'WTT- HGV refrigerated (all diesel)': 'WTT- HGV (refrigerated, all diesel)',
    'Managed HGV (all diesel)': 'Managed HGV (non-refrigerated, all diesel)',
    'Managed HGV refrigerated (all diesel)': 'Managed HGV (refrigerated, all diesel)',
  },
  // Level 3 (any category)
  level3: {
    Biodiesel: 'Biodiesel ME',
    'Biodiesel (from used cooking oil)': 'Biodiesel ME (from used cooking oil)',
    'Biodiesel (from tallow)': 'Biodiesel ME (from tallow)',
    Biomethane: 'Biomethane (compressed)',
  },
  // "Column Text" (a variant: fuel type, laden %, disposal method...)
  columnText: {
    Combustion: 'Incineration with Energy Recovery',
  },
  units: {
    Litres: 'litres',
  },
}

/*
  Column texts that only describe the unit (2019-2021 files: "Energy - Gross CV"
  next to the unit "kWh (Gross CV)"). They are not part of the source's identity.
*/
const UNIT_ONLY_TEXTS = new Set(['Energy - Gross CV', 'Energy - Net CV', 'Volume', 'Tonnes'])

/*
  Refrigerants (from 2022) come in three rows. We keep the Kyoto figure, which is
  what belongs in Scope 1 under the GHG Protocol (Montreal-protocol gases such as
  CFCs/HCFCs are reported outside the scopes). Earlier years have just one row.
*/
const REFRIGERANT_KYOTO = 'Emissions including only Kyoto products'
const REFRIGERANT_OTHER = new Set([
  'Emissions including only non-Kyoto products',
  'Total emissions including non-Kyoto products',
])

const UNITS = new Set([
  'kWh (Gross CV)', 'kWh (Net CV)', 'kWh', 'litres', 'tonnes', 'kg', 'GJ', 'cubic metres', 'million litres',
  'km', 'miles', 'tonne.km', 'passenger.km', 'Room per night', 'per FTE Working Hour',
])

const here = dirname(fileURLToPath(import.meta.url))
const OUT = join(here, '../seed/uk-ghg')

const clean = (value) => {
  if (value === null || value === undefined) return null
  const text = String(value).replace(/\s+/g, ' ').trim()
  return text === '' ? null : text
}

/** One spreadsheet row -> a normalised factor, or null when we don't keep it. */
function normalise(row, columns) {
  const scopeText = clean(row[columns.scope])
  const scope = { 'Scope 1': 1, 'Scope 2': 2, 'Scope 3': 3 }[scopeText]
  // Only the total (kg CO2e), not the per-gas breakdown rows; only Scope 1-3
  if (!scope || clean(row[columns.ghg]) !== 'kg CO2e') return null
  const value = row[columns.value]
  if (typeof value !== 'number' || !Number.isFinite(value)) return null // blank / "N/A" cells

  let [l1, l2, l3, l4] = columns.levels.map((i) => clean(row[i]))
  let text = clean(row[columns.text])
  let unit = clean(row[columns.unit])
  l1 = RENAMES.level1[l1] ?? l1
  l2 = RENAMES.level2[l2] ?? l2
  l3 = RENAMES.level3[l3] ?? l3
  // 2026: "All rigids" -> "Average non-refrigerated rigids" / "Average refrigerated rigids" (same for artics, HGVs)
  const allHgv = /^All (rigids|artics|HGVs)$/.exec(l3 ?? '')
  if (allHgv && /HGV/.test(l2 ?? '')) {
    l3 = `Average ${/\(refrigerated/.test(l2) ? 'refrigerated' : 'non-refrigerated'} ${allHgv[1]}`
  }
  unit = RENAMES.units[unit] ?? unit
  if (!UNITS.has(unit)) throw new Error(`Unknown unit "${unit}" (add it to UNITS if it is real)`)

  if (l1 === 'Refrigerant & other') {
    // Montreal-protocol gases (CFCs, HCFCs such as R-22) are outside the scopes
    if (l2 === 'Montreal protocol products') return null
    if (REFRIGERANT_OTHER.has(text)) return null
    if (text === REFRIGERANT_KYOTO) text = null
  }
  if (UNIT_ONLY_TEXTS.has(text)) text = null
  text = RENAMES.columnText[text] ?? text
  if (l4 && UNITS.has(l4)) l4 = null // electricity rows repeat the unit as level 4
  if (l4 && /^\d{4}$/.test(l4)) l4 = null // 2022 file: a stray year ("2020") as level 4

  // The readable path below the category, without empty or repeated parts
  // ("Water supply > Water supply > Water supply" -> just the category)
  const path = []
  for (const part of [l2, l3, l4, text]) {
    if (part && part !== l1 && part !== path.at(-1)) path.push(part)
  }
  // Lower case: the UK changes capitals between years ("Natural Gas" -> "Natural gas").
  // The names shown in the app come from the newest year that has the source.
  const key = [scope, l1, ...path].join(' > ').toLowerCase()
  return { key, scope, category: l1, path, unit, value: Number(value.toPrecision(10)) }
}

function readWorkbook(buffer) {
  const workbook = XLSX.read(buffer)
  const sheet = workbook.Sheets['Factors by Category']
  if (!sheet) throw new Error('Sheet "Factors by Category" not found')
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false })
  const headerIndex = rows.findIndex((row) => row.includes('Level 1'))
  const header = rows[headerIndex].map(clean)
  const find = (...names) => {
    const index = header.findIndex((name) => names.includes(name))
    if (index < 0) throw new Error(`Column ${names.join(' / ')} not found in ${JSON.stringify(header)}`)
    return index
  }
  const columns = {
    scope: find('Scope'),
    levels: [1, 2, 3, 4].map((n) => find(`Level ${n}`)),
    text: find('Column Text'),
    unit: find('UOM'),
    ghg: find('GHG', 'GHG/Unit'), // 2019-2021: "GHG"; from 2022: "GHG/Unit"
    value: header.findIndex((name) => /^GHG Conversion Factor \d{4}$/.test(name ?? '')),
  }
  return { rows: rows.slice(headerIndex + 1), columns }
}

async function download(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

/** Short stable id for a source key, used in the per-year files to keep them small. */
const refOf = (key) => createHash('sha1').update(key).digest('hex').slice(0, 12)

const byYear = new Map()
for (const set of SETS) {
  process.stdout.write(`${set.year}: downloading... `)
  const buffer = await download(set.url)
  const { rows, columns } = readWorkbook(buffer)
  const factors = new Map()
  for (const row of rows) {
    const factor = normalise(row, columns)
    if (!factor) continue
    const id = `${factor.key} [${factor.unit}]`
    if (factors.has(id)) throw new Error(`${set.year}: two factors for ${id}`)
    factors.set(id, factor)
  }
  byYear.set(set.year, { ...set, fileSha256: createHash('sha256').update(buffer).digest('hex'), factors: [...factors.values()] })
  console.log(`${factors.size} factors`)
}

// Sources: the newest year's order first (the UK's own logical order), then
// sources that only exist in older years
const sources = new Map()
for (const set of [...byYear.values()].reverse()) {
  for (const { key, scope, category, path } of set.factors) {
    if (!sources.has(key)) sources.set(key, { ref: refOf(key), key, scope, category, path, years: [] })
  }
}
for (const set of byYear.values()) {
  for (const key of new Set(set.factors.map((factor) => factor.key))) sources.get(key).years.push(set.year)
}
const refs = new Set([...sources.values()].map((source) => source.ref))
if (refs.size !== sources.size) throw new Error('Two source keys share a ref; lengthen refOf()')

// Write the seed files. One line per record keeps git diffs readable.
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const lines = (items) => `[\n${items.map((item) => JSON.stringify(item)).join(',\n')}\n]\n`

const sourcesContent = lines(
  [...sources.values()].map(({ ref, key, scope, category, path }) => ({ ref, key, scope, category, path })),
)
writeFileSync(join(OUT, 'sources.json'), sourcesContent)
const manifestSets = []
for (const set of byYear.values()) {
  const file = `factors-${set.year}.json`
  const content = lines(set.factors.map((factor) => [refOf(factor.key), factor.unit, factor.value]))
  writeFileSync(join(OUT, file), content)
  manifestSets.push({
    year: set.year,
    version: set.version,
    file,
    factorCount: set.factors.length,
    // Changes when the data changes, so the API knows to re-load this year
    contentSha256: createHash('sha256').update(content).digest('hex'),
    sourceUrl: set.url,
    sourceFileSha256: set.fileSha256,
  })
}
writeFileSync(
  join(OUT, 'manifest.json'),
  `${JSON.stringify(
    {
      format: 1,
      publisher: PUBLISHER,
      title: TITLE,
      licence: LICENCE,
      licenceUrl: LICENCE_URL,
      sourcesSha256: createHash('sha256').update(sourcesContent).digest('hex'),
      sets: manifestSets,
    },
    null,
    2,
  )}\n`,
)
console.log(`\nWrote ${sources.size} sources and ${manifestSets.length} years to ${OUT}`)

// Continuity report: sources that stop or start between consecutive years.
// "Gone" ones are often renames (add them to RENAMES); some are real changes.
console.log('\nContinuity (sources, ignoring units):')
const years = [...byYear.keys()]
for (let i = 1; i < years.length; i++) {
  const before = new Set(byYear.get(years[i - 1]).factors.map((factor) => factor.key))
  const after = new Set(byYear.get(years[i]).factors.map((factor) => factor.key))
  const gone = [...before].filter((key) => !after.has(key))
  const added = [...after].filter((key) => !before.has(key))
  console.log(`  ${years[i - 1]} -> ${years[i]}: ${gone.length} gone, ${added.length} new`)
  for (const key of gone.slice(0, 8)) console.log(`      gone: ${key}`)
  for (const key of added.slice(0, 8)) console.log(`      new:  ${key}`)
}
