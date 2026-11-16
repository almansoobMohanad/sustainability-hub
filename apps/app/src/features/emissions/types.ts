/** GHG Protocol scopes. */
export type Scope = 1 | 2 | 3

export const SCOPES: Scope[] = [1, 2, 3]

export const SCOPE_INFO: Record<Scope, { label: string; description: string }> = {
  1: { label: 'Scope 1', description: 'Direct emissions from sources you own or control' },
  2: { label: 'Scope 2', description: 'Indirect emissions from purchased energy' },
  3: { label: 'Scope 3', description: 'Other indirect emissions in your value chain' },
}

/** One emission factor: how much CO2e one unit of an activity produces. */
export type EmissionSource = {
  id: string
  scope: Scope
  category: string
  name: string
  /** Unit the activity is measured in, e.g. "litres", "kWh", "km". */
  unit: string
  /** kg CO2e per unit. */
  factorKgPerUnit: number
  /** Where the factor comes from. */
  reference: string
}

export type VerificationStatus = 'unverified' | 'verified' | 'rejected'

/** One recorded activity and its calculated emissions. */
export type EmissionEntry = {
  id: string
  sourceId: string
  /** Reporting month, "YYYY-MM". */
  period: string
  /** Activity amount, in the source's unit. */
  amount: number
  /** Factor used at the time of entry (kept so later factor changes don't rewrite history). */
  factorKgPerUnit: number
  /** amount x factor, in kg CO2e. */
  co2eKg: number
  dataSource?: string
  notes?: string
  status: VerificationStatus
  createdAt: string
}

export type NewEmissionEntry = Pick<
  EmissionEntry,
  'sourceId' | 'period' | 'amount' | 'dataSource' | 'notes'
>
