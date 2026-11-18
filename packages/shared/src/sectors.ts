/*
  The sectors a company can choose when it's created. Each one has a template
  (a suggested list of emission sources, defined in the API:
  apps/api/src/factors/sector-templates.ts) that the person can adjust before
  confirming, and change any time afterwards.

  Ids are stored in the database (company_settings.sector): never rename one;
  add new sectors instead, with a template.
*/

export const SECTORS = [
  'manufacturing',
  'logistics',
  'office',
  'construction',
  'retail',
  'hospitality',
  'agriculture',
  'other',
] as const

export type Sector = (typeof SECTORS)[number]

export const SECTOR_INFO: Record<Sector, { label: string; description: string }> = {
  manufacturing: {
    label: 'Manufacturing',
    description: 'Factories and processing plants: fuels for heat and machinery, refrigeration, freight.',
  },
  logistics: {
    label: 'Logistics and transport',
    description: 'Fleets of vans and lorries, refrigerated transport, freight by road, sea and air.',
  },
  office: {
    label: 'Office and professional services',
    description: 'Offices: electricity, air conditioning, business travel, homeworking.',
  },
  construction: {
    label: 'Construction',
    description: 'Site plant and vehicles, construction materials, construction waste.',
  },
  retail: {
    label: 'Retail',
    description: 'Shops and supermarkets: refrigeration, deliveries, packaging waste.',
  },
  hospitality: {
    label: 'Hospitality and food service',
    description: 'Hotels, restaurants and catering: cooking fuels, refrigeration, food waste.',
  },
  agriculture: {
    label: 'Agriculture',
    description: 'Farms and plantations: farm vehicles and machinery, fuels, cold storage.',
  },
  other: {
    label: 'Other',
    description: 'A general starting point: electricity, air conditioning, travel, water and waste.',
  },
}

export function isSector(value: unknown): value is Sector {
  return typeof value === 'string' && (SECTORS as readonly string[]).includes(value)
}
