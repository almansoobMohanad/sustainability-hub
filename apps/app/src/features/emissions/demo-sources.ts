import type { EmissionSource } from './types'

/*
  DEMO EMISSION FACTORS: for development only, not for reporting.

  Rounded, approximate values in the style of the UK Government GHG Conversion
  Factors, so the app has realistic-looking numbers before the API exists. The
  real factor library (UK Government GHG Conversion Factors 2025 + company custom
  factors, with version history) will be seeded into the database and served by
  the API, replacing this file.
*/
const DEMO_REFERENCE = 'Demo factor (approximate, development only)'

export const DEMO_SOURCES: EmissionSource[] = [
  // Scope 1: direct
  { id: 's1-natural-gas', scope: 1, category: 'Stationary combustion', name: 'Natural gas', unit: 'kWh', factorKgPerUnit: 0.183, reference: DEMO_REFERENCE },
  { id: 's1-diesel-generator', scope: 1, category: 'Stationary combustion', name: 'Diesel (generators)', unit: 'litres', factorKgPerUnit: 2.51, reference: DEMO_REFERENCE },
  { id: 's1-fleet-diesel', scope: 1, category: 'Mobile combustion', name: 'Diesel (company vehicles)', unit: 'litres', factorKgPerUnit: 2.51, reference: DEMO_REFERENCE },
  { id: 's1-fleet-petrol', scope: 1, category: 'Mobile combustion', name: 'Petrol (company vehicles)', unit: 'litres', factorKgPerUnit: 2.1, reference: DEMO_REFERENCE },
  { id: 's1-refrigerant-r410a', scope: 1, category: 'Fugitive emissions', name: 'Refrigerant R-410A (leakage)', unit: 'kg', factorKgPerUnit: 2088, reference: DEMO_REFERENCE },

  // Scope 2: purchased energy
  { id: 's2-electricity-grid', scope: 2, category: 'Purchased electricity', name: 'Grid electricity', unit: 'kWh', factorKgPerUnit: 0.177, reference: DEMO_REFERENCE },
  { id: 's2-district-heat', scope: 2, category: 'Purchased heat and steam', name: 'District heat and steam', unit: 'kWh', factorKgPerUnit: 0.17, reference: DEMO_REFERENCE },

  // Scope 3: value chain
  { id: 's3-car-travel', scope: 3, category: 'Business travel', name: 'Car (average, employee-owned)', unit: 'km', factorKgPerUnit: 0.17, reference: DEMO_REFERENCE },
  { id: 's3-flight-short', scope: 3, category: 'Business travel', name: 'Flights (short-haul, economy)', unit: 'passenger-km', factorKgPerUnit: 0.15, reference: DEMO_REFERENCE },
  { id: 's3-rail', scope: 3, category: 'Business travel', name: 'Rail (national)', unit: 'passenger-km', factorKgPerUnit: 0.035, reference: DEMO_REFERENCE },
  { id: 's3-waste-landfill', scope: 3, category: 'Waste', name: 'Mixed commercial waste (landfill)', unit: 'tonnes', factorKgPerUnit: 467, reference: DEMO_REFERENCE },
  { id: 's3-water-supply', scope: 3, category: 'Water', name: 'Water supply', unit: 'm³', factorKgPerUnit: 0.15, reference: DEMO_REFERENCE },
]
