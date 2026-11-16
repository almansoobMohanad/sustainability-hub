import { DEMO_SOURCES } from './demo-sources'
import type { EmissionEntry, EmissionSource, NewEmissionEntry } from './types'

/*
  TEMPORARY DEMO DATA LAYER: stands in for the real API until apps/api exists.

  - Entries are kept in this browser's localStorage, so they survive a reload
    but are not shared with anyone else.
  - On first use it seeds realistic monthly data (from January last year up to
    last month) so the dashboard has something to show.
  - Every function is async with a short delay, like a network call, so the
    pages are already written for real loading states.

  When the API is ready, replace the bodies of these functions with fetch()
  calls to /api/v1/... Nothing else in the app needs to change: pages only use
  the query hooks in queries.ts.
*/

const STORAGE_KEY = 'hub.demo.emissions.v1'
const LATENCY_MS = 250

const wait = (ms = LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms))

const sourceById = new Map(DEMO_SOURCES.map((s) => [s.id, s]))

function readStore(): EmissionEntry[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as EmissionEntry[]) : null
  } catch {
    return null // storage blocked or corrupted: fall back to fresh demo data
  }
}

function writeStore(entries: EmissionEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // storage blocked (private mode etc.): data lives only in memory this session
  }
}

let memory: EmissionEntry[] | null = null

function allEntries(): EmissionEntry[] {
  if (!memory) {
    memory = readStore() ?? seedEntries()
    writeStore(memory)
  }
  return memory
}

/** Small deterministic pseudo-random generator, so the seed data is the same every time. */
function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

/** Typical monthly activity per source (amount in the source's unit). */
const SEED_PROFILE: { sourceId: string; base: number; seasonal: number }[] = [
  { sourceId: 's1-natural-gas', base: 42000, seasonal: 0.45 }, // more heating in winter
  { sourceId: 's1-fleet-diesel', base: 3100, seasonal: 0.05 },
  { sourceId: 's1-fleet-petrol', base: 900, seasonal: 0.05 },
  { sourceId: 's2-electricity-grid', base: 96000, seasonal: 0.15 },
  { sourceId: 's3-car-travel', base: 14000, seasonal: 0.1 },
  { sourceId: 's3-flight-short', base: 22000, seasonal: 0.3 },
  { sourceId: 's3-waste-landfill', base: 11, seasonal: 0 },
]

function seedEntries(): EmissionEntry[] {
  const random = seededRandom(42)
  const now = new Date()
  const entries: EmissionEntry[] = []
  const startYear = now.getFullYear() - 1

  for (let year = startYear; year <= now.getFullYear(); year++) {
    for (let month = 0; month < 12; month++) {
      // Only months that have already finished
      if (year === now.getFullYear() && month >= now.getMonth()) break
      const period = `${year}-${String(month + 1).padStart(2, '0')}`
      // Peaks in January, lowest in July
      const season = Math.cos(((month - 0) / 12) * 2 * Math.PI)
      // This year runs a little lower than last year (reduction progress)
      const yearTrend = year === startYear ? 1 : 0.92

      for (const { sourceId, base, seasonal } of SEED_PROFILE) {
        const source = sourceById.get(sourceId)!
        const noise = 0.9 + random() * 0.2
        const amount = Math.round(base * (1 + seasonal * season) * yearTrend * noise * 100) / 100
        const isOld = year < now.getFullYear() || month < now.getMonth() - 2
        entries.push({
          id: `seed-${period}-${sourceId}`,
          sourceId,
          period,
          amount,
          factorKgPerUnit: source.factorKgPerUnit,
          co2eKg: amount * source.factorKgPerUnit,
          dataSource: 'Demo data',
          status: isOld ? 'verified' : 'unverified',
          createdAt: new Date(year, month + 1, 3).toISOString(),
        })
      }
    }
  }
  return entries
}

export async function fetchSources(): Promise<EmissionSource[]> {
  await wait()
  return DEMO_SOURCES
}

export async function fetchEntries(): Promise<EmissionEntry[]> {
  await wait()
  return [...allEntries()]
}

export async function createEntry(input: NewEmissionEntry): Promise<EmissionEntry> {
  await wait(400)
  const source = sourceById.get(input.sourceId)
  if (!source) throw new Error('Unknown emission source')
  const entry: EmissionEntry = {
    id: crypto.randomUUID(),
    ...input,
    factorKgPerUnit: source.factorKgPerUnit,
    co2eKg: input.amount * source.factorKgPerUnit,
    status: 'unverified',
    createdAt: new Date().toISOString(),
  }
  memory = [...allEntries(), entry]
  writeStore(memory)
  return entry
}

/** Clears entries added in this browser and restores the original demo data. */
export async function resetDemoData(): Promise<void> {
  await wait()
  memory = seedEntries()
  writeStore(memory)
}
