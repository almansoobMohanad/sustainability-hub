/*
  SEDG: Capital Markets Malaysia's Simplified ESG Disclosure Guide, version 2.
  The ONE list of its disclosures and fields: the API validates answers with it,
  the app builds the form from it and the PDF prints it. Codes, levels, topics
  and indicator names follow the official v2 data collection template
  (https://sedg.capitalmarketsmalaysia.com/, "SEDG Data Collection Template V.2");
  the explanations (`info`) are our own words.

  Field keys are stored in the database (sedg_reports.answers): never rename
  one; add a new key instead.

  A few deliberate differences from the template, to make the data usable:
  - Energy is entered in kWh and water in litres (the template allows any
    joules/watthours and litres).
  - "Percentage of employees/directors by gender/age" is split into the usual
    groups (women/men, under 30/30-50/over 50) instead of one free number.
  - General information has one extra field, the year's revenue, used only to
    calculate the GHG intensity (E1.7).
*/

export const SEDG_LEVELS = ['basic', 'intermediate', 'advanced'] as const
export type SedgLevel = (typeof SEDG_LEVELS)[number]

export const SEDG_LEVEL_LABELS: Record<SedgLevel, string> = {
  basic: 'Basic',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

/** A report at `chosen` level includes the disclosures of that level and the ones below it */
export function levelIncludes(chosen: SedgLevel, level: SedgLevel) {
  return SEDG_LEVELS.indexOf(level) <= SEDG_LEVELS.indexOf(chosen)
}

export function isSedgLevel(value: unknown): value is SedgLevel {
  return typeof value === 'string' && (SEDG_LEVELS as readonly string[]).includes(value)
}

export const SEDG_PILLARS = ['environmental', 'social', 'governance'] as const
export type SedgPillar = (typeof SEDG_PILLARS)[number]

export const SEDG_PILLAR_LABELS: Record<SedgPillar, string> = {
  environmental: 'Environmental',
  social: 'Social',
  governance: 'Governance',
}

/**
 * Figures the API can calculate from the company's VERIFIED entries (or its
 * settings). A field with `auto` shows that figure until someone enters their
 * own; reductions compare the year with the company's baseline year.
 */
export const SEDG_AUTO_FIGURES = [
  'companyName',
  'disclosureDate',
  'disclosurePeriod',
  'scope1',
  'scope2',
  'scope3',
  'scope1Reduction',
  'scope2Reduction',
  'scope3Reduction',
  'intensity',
  'electricity',
  'electricityReduction',
  'purchasedWater',
  'waterReduction',
  'wasteGenerated',
  'wasteDiverted',
  'wasteDisposed',
] as const
export type SedgAutoFigure = (typeof SEDG_AUTO_FIGURES)[number]

/*
  What a field holds:
    quantity  a number with a unit (signed: may be negative, e.g. a reduction
              that turned out to be an increase)
    percent   0 to 100
    count     a whole number (people, incidents, directors)
    year      a calendar year
    text      one short line
    list      several lines (lists, descriptions)
*/
export type SedgFieldKind = 'quantity' | 'percent' | 'count' | 'year' | 'text' | 'list'

export type SedgField = {
  /** Stored key; never rename */
  key: string
  /** The indicator, as in the template */
  label: string
  kind: SedgFieldKind
  /** For quantities */
  unit?: string
  /** Quantities that may be negative */
  signed?: boolean
  /** Not needed for the disclosure to count as complete ("if applicable", "if any") */
  optional?: boolean
  /** Calculated from the company's data until someone enters their own value */
  auto?: SedgAutoFigure
}

export type SedgDisclosure = {
  code: string
  pillar: SedgPillar
  level: SedgLevel
  topic: string
  /** The template's "Topic Description" */
  title: string
  /** What to report, in our words (shown behind the (i)) */
  info: string
  fields: SedgField[]
}

const T_CO2E = 't CO2e'
const KWH = 'kWh'
const LITRES = 'litres'
const TONNES = 'tonnes'

/** General information at the top of the report (always included, whatever the level) */
export const SEDG_GENERAL_FIELDS: SedgField[] = [
  { key: 'gen_organisation', label: 'Name of organisation', kind: 'text', auto: 'companyName' },
  { key: 'gen_disclosure_date', label: 'Date of disclosure', kind: 'text', auto: 'disclosureDate' },
  { key: 'gen_disclosure_period', label: 'Disclosure period', kind: 'text', auto: 'disclosurePeriod' },
  { key: 'gen_headquarters', label: 'Location of headquarters', kind: 'text' },
  { key: 'gen_entities', label: 'Entities included', kind: 'list' },
  { key: 'gen_locations', label: 'Locations included', kind: 'list' },
  {
    key: 'gen_revenue',
    label: 'Revenue for the year',
    kind: 'quantity',
    unit: 'MYR',
    optional: true,
  },
]

const energyFields = (prefix: string, signed: boolean): SedgField[] => [
  { key: `${prefix}_renewable`, label: 'Renewable fuel sources', kind: 'quantity', unit: KWH, signed },
  { key: `${prefix}_nonrenewable`, label: 'Non-renewable fuel sources', kind: 'quantity', unit: KWH, signed },
  {
    key: `${prefix}_electricity`,
    label: 'Electricity',
    kind: 'quantity',
    unit: KWH,
    signed,
    auto: signed ? 'electricityReduction' : 'electricity',
  },
  { key: `${prefix}_heating`, label: 'Heating (if applicable)', kind: 'quantity', unit: KWH, signed, optional: true },
  { key: `${prefix}_cooling`, label: 'Cooling (if applicable)', kind: 'quantity', unit: KWH, signed, optional: true },
  { key: `${prefix}_steam`, label: 'Steam (if applicable)', kind: 'quantity', unit: KWH, signed, optional: true },
]

const wasteFlows = (prefix: string, group: string, optional = false): SedgField[] => [
  { key: `${prefix}_generated`, label: `${group}: generated`, kind: 'quantity', unit: TONNES, optional },
  { key: `${prefix}_diverted`, label: `${group}: diverted from disposal`, kind: 'quantity', unit: TONNES, optional },
  { key: `${prefix}_disposed`, label: `${group}: directed to disposal`, kind: 'quantity', unit: TONNES, optional },
]

const genderAndAge = (prefix: string, who: string): SedgField[] => [
  { key: `${prefix}_women`, label: `${who}: women`, kind: 'percent' },
  { key: `${prefix}_men`, label: `${who}: men`, kind: 'percent' },
  { key: `${prefix}_under30`, label: `${who}: under 30 years old`, kind: 'percent' },
  { key: `${prefix}_30to50`, label: `${who}: 30 to 50 years old`, kind: 'percent' },
  { key: `${prefix}_over50`, label: `${who}: over 50 years old`, kind: 'percent' },
]

export const SEDG_DISCLOSURES: SedgDisclosure[] = [
  // ---- Environmental ----
  {
    code: 'E1.1',
    pillar: 'environmental',
    level: 'basic',
    topic: 'Emissions',
    title: 'GHG emissions',
    info: 'Direct emissions from sources the company owns or controls: fuel burned on site and in company vehicles, refrigerant leaks.',
    fields: [{ key: 'e1_1', label: 'Total Scope 1 GHG emissions', kind: 'quantity', unit: T_CO2E, auto: 'scope1' }],
  },
  {
    code: 'E1.2',
    pillar: 'environmental',
    level: 'basic',
    topic: 'Emissions',
    title: 'GHG emissions',
    info: 'Indirect emissions from the electricity, heat and steam the company buys.',
    fields: [{ key: 'e1_2', label: 'Total Scope 2 GHG emissions', kind: 'quantity', unit: T_CO2E, auto: 'scope2' }],
  },
  {
    code: 'E1.3',
    pillar: 'environmental',
    level: 'intermediate',
    topic: 'Emissions',
    title: 'GHG emissions',
    info: 'How much Scope 1 emissions went down compared with the baseline year (a negative number means they went up).',
    fields: [
      {
        key: 'e1_3',
        label: 'Scope 1 GHG emissions reduction',
        kind: 'quantity',
        unit: T_CO2E,
        signed: true,
        auto: 'scope1Reduction',
      },
    ],
  },
  {
    code: 'E1.4',
    pillar: 'environmental',
    level: 'intermediate',
    topic: 'Emissions',
    title: 'GHG emissions',
    info: 'How much Scope 2 emissions went down compared with the baseline year (a negative number means they went up).',
    fields: [
      {
        key: 'e1_4',
        label: 'Scope 2 GHG emissions reduction',
        kind: 'quantity',
        unit: T_CO2E,
        signed: true,
        auto: 'scope2Reduction',
      },
    ],
  },
  {
    code: 'E1.5',
    pillar: 'environmental',
    level: 'advanced',
    topic: 'Emissions',
    title: 'GHG emissions',
    info: "Other indirect emissions in the company's value chain: business travel, freight, waste, water, purchased materials.",
    fields: [{ key: 'e1_5', label: 'Total Scope 3 GHG emissions', kind: 'quantity', unit: T_CO2E, auto: 'scope3' }],
  },
  {
    code: 'E1.6',
    pillar: 'environmental',
    level: 'advanced',
    topic: 'Emissions',
    title: 'GHG emissions',
    info: 'How much Scope 3 emissions went down compared with the baseline year (a negative number means they went up).',
    fields: [
      {
        key: 'e1_6',
        label: 'Scope 3 GHG emissions reduction',
        kind: 'quantity',
        unit: T_CO2E,
        signed: true,
        auto: 'scope3Reduction',
      },
    ],
  },
  {
    code: 'E1.7',
    pillar: 'environmental',
    level: 'advanced',
    topic: 'Emissions',
    title: 'GHG emissions',
    info: 'Scope 1 and 2 emissions per MYR 1 million of revenue, so years and companies of different sizes can be compared. Calculated when the revenue is filled in under General information.',
    fields: [
      {
        key: 'e1_7',
        label: 'Total Scope 1 and 2 GHG intensity',
        kind: 'quantity',
        unit: 't CO2e per MYR 1 million revenue',
        auto: 'intensity',
      },
    ],
  },
  {
    code: 'E2.1',
    pillar: 'environmental',
    level: 'basic',
    topic: 'Energy',
    title: 'Energy consumption',
    info: 'Energy used during the year, by source. Electricity is filled in from your electricity entries; convert fuels to kWh with their energy content.',
    fields: energyFields('e2_1', false),
  },
  {
    code: 'E2.2',
    pillar: 'environmental',
    level: 'intermediate',
    topic: 'Energy',
    title: 'Energy consumption reduction',
    info: 'How much energy use went down compared with the baseline year, by source (a negative number means it went up).',
    fields: energyFields('e2_2', true),
  },
  {
    code: 'E3.1',
    pillar: 'environmental',
    level: 'basic',
    topic: 'Water',
    title: 'Total water withdrawn',
    info: 'Water taken in during the year, by source. Purchased water is filled in from your water supply entries.',
    fields: [
      { key: 'e3_1_purchased', label: 'Purchased water', kind: 'quantity', unit: LITRES, auto: 'purchasedWater' },
      { key: 'e3_1_surface', label: 'Surface water (if applicable)', kind: 'quantity', unit: LITRES, optional: true },
      { key: 'e3_1_ground', label: 'Groundwater (if applicable)', kind: 'quantity', unit: LITRES, optional: true },
      { key: 'e3_1_sea', label: 'Seawater (if applicable)', kind: 'quantity', unit: LITRES, optional: true },
      { key: 'e3_1_produced', label: 'Produced water (if applicable)', kind: 'quantity', unit: LITRES, optional: true },
    ],
  },
  {
    code: 'E3.2',
    pillar: 'environmental',
    level: 'intermediate',
    topic: 'Water',
    title: 'Total water withdrawn',
    info: 'How much water withdrawal went down compared with the baseline year. Filled in from your water supply entries (a negative number means it went up).',
    fields: [
      {
        key: 'e3_2',
        label: 'Reduction of total water withdrawn',
        kind: 'quantity',
        unit: LITRES,
        signed: true,
        auto: 'waterReduction',
      },
    ],
  },
  {
    code: 'E4.1',
    pillar: 'environmental',
    level: 'basic',
    topic: 'Waste',
    title: 'Total waste',
    info: 'All waste for the year. Filled in from your waste entries: recycling, composting, anaerobic digestion and re-use count as diverted from disposal; landfill and incineration as directed to disposal.',
    fields: [
      { key: 'e4_1_generated', label: 'Generated', kind: 'quantity', unit: TONNES, auto: 'wasteGenerated' },
      { key: 'e4_1_diverted', label: 'Diverted from disposal', kind: 'quantity', unit: TONNES, auto: 'wasteDiverted' },
      { key: 'e4_1_disposed', label: 'Directed to disposal', kind: 'quantity', unit: TONNES, auto: 'wasteDisposed' },
    ],
  },
  {
    code: 'E4.2',
    pillar: 'environmental',
    level: 'intermediate',
    topic: 'Waste',
    title: 'Waste breakdown',
    info: 'The waste split into hazardous and non-hazardous, plus waste streams typical of your sector and the main materials in your waste, if you track them.',
    fields: [
      ...wasteFlows('e4_2_haz', 'Hazardous waste'),
      ...wasteFlows('e4_2_nonhaz', 'Non-hazardous waste'),
      ...wasteFlows('e4_2_sector', 'Sector-specific waste streams', true),
      ...wasteFlows('e4_2_material', 'Material composition', true),
    ],
  },
  {
    code: 'E4.3',
    pillar: 'environmental',
    level: 'advanced',
    topic: 'Waste',
    title: 'Waste diverted from disposal',
    info: 'How the waste kept out of disposal was handled: prepared for re-use, recycled or recovered in another way.',
    fields: [
      { key: 'e4_3_haz_reuse', label: 'Hazardous: preparation for reuse', kind: 'quantity', unit: TONNES },
      { key: 'e4_3_haz_recycling', label: 'Hazardous: recycling', kind: 'quantity', unit: TONNES },
      { key: 'e4_3_haz_other', label: 'Hazardous: other recovery', kind: 'quantity', unit: TONNES },
      { key: 'e4_3_nonhaz_reuse', label: 'Non-hazardous: preparation for reuse', kind: 'quantity', unit: TONNES },
      { key: 'e4_3_nonhaz_recycling', label: 'Non-hazardous: recycling', kind: 'quantity', unit: TONNES },
      { key: 'e4_3_nonhaz_other', label: 'Non-hazardous: other recovery', kind: 'quantity', unit: TONNES },
    ],
  },
  {
    code: 'E4.4',
    pillar: 'environmental',
    level: 'advanced',
    topic: 'Waste',
    title: 'Waste directed to disposal',
    info: 'How the waste that went to disposal was handled: incinerated (with or without energy recovery), landfilled or disposed of otherwise.',
    fields: [
      { key: 'e4_4_haz_incin_recovery', label: 'Hazardous: incineration with recovery', kind: 'quantity', unit: TONNES },
      { key: 'e4_4_haz_incin', label: 'Hazardous: incineration without recovery', kind: 'quantity', unit: TONNES },
      { key: 'e4_4_haz_landfill', label: 'Hazardous: landfilling', kind: 'quantity', unit: TONNES },
      { key: 'e4_4_haz_other', label: 'Hazardous: other disposal', kind: 'quantity', unit: TONNES },
      { key: 'e4_4_nonhaz_incin_recovery', label: 'Non-hazardous: incineration with recovery', kind: 'quantity', unit: TONNES },
      { key: 'e4_4_nonhaz_incin', label: 'Non-hazardous: incineration without recovery', kind: 'quantity', unit: TONNES },
      { key: 'e4_4_nonhaz_landfill', label: 'Non-hazardous: landfilling', kind: 'quantity', unit: TONNES },
      { key: 'e4_4_nonhaz_other', label: 'Non-hazardous: other disposal', kind: 'quantity', unit: TONNES },
    ],
  },
  {
    code: 'E5.1',
    pillar: 'environmental',
    level: 'basic',
    topic: 'Materials',
    title: 'Key materials',
    info: 'The main materials used to make your primary products or deliver your services.',
    fields: [{ key: 'e5_1', label: 'List of materials for primary products and services', kind: 'list' }],
  },
  {
    code: 'E5.2',
    pillar: 'environmental',
    level: 'advanced',
    topic: 'Materials',
    title: 'Key materials',
    info: 'The share of those materials that comes from recycled sources.',
    fields: [{ key: 'e5_2', label: 'Recycled input materials for primary products and services', kind: 'percent' }],
  },

  // ---- Social ----
  {
    code: 'S1.1',
    pillar: 'social',
    level: 'basic',
    topic: 'Human rights and labour practices',
    title: 'Child labour and forced labour incidents',
    info: 'Confirmed cases of child labour or forced labour in your operations during the year (0 if none), and what happened.',
    fields: [
      { key: 's1_1_child', label: 'Number of child labour incidents', kind: 'count' },
      { key: 's1_1_child_nature', label: 'Nature of child labour incidents, if any', kind: 'list', optional: true },
      { key: 's1_1_forced', label: 'Number of forced labour incidents', kind: 'count' },
      { key: 's1_1_forced_nature', label: 'Nature of forced labour incidents, if any', kind: 'list', optional: true },
    ],
  },
  {
    code: 'S1.2',
    pillar: 'social',
    level: 'intermediate',
    topic: 'Human rights and labour practices',
    title: 'Risk of child labour and forced labour',
    info: 'Operations and suppliers where child labour or forced labour is a significant risk.',
    fields: [
      { key: 's1_2_child', label: 'Operations and suppliers with significant risk of child labour', kind: 'list' },
      { key: 's1_2_forced', label: 'Operations and suppliers with significant risk of forced labour', kind: 'list' },
    ],
  },
  {
    code: 'S2.1',
    pillar: 'social',
    level: 'basic',
    topic: 'Employee management',
    title: 'Employee training',
    info: 'Total training hours during the year divided by the number of employees.',
    fields: [{ key: 's2_1', label: 'Average hours of training per employee', kind: 'quantity', unit: 'hours' }],
  },
  {
    code: 'S2.2',
    pillar: 'social',
    level: 'intermediate',
    topic: 'Employee management',
    title: 'Employees',
    info: 'Employees at the end of the year, and the share who left during the year.',
    fields: [
      { key: 's2_2_employees', label: 'Number of employees', kind: 'count' },
      { key: 's2_2_turnover', label: 'Turnover rate', kind: 'percent' },
    ],
  },
  {
    code: 'S2.3',
    pillar: 'social',
    level: 'basic',
    topic: 'Employee management',
    title: 'Employees minimum wage',
    info: 'The share of employees paid at least the applicable minimum wage.',
    fields: [
      {
        key: 's2_3',
        label: 'Employees meeting or above applicable minimum wage laws',
        kind: 'percent',
      },
    ],
  },
  {
    code: 'S3.1',
    pillar: 'social',
    level: 'basic',
    topic: 'Diversity, equity and inclusion',
    title: "Company's employees",
    info: 'The share of employees by gender and by age group.',
    fields: genderAndAge('s3_1', 'Employees'),
  },
  {
    code: 'S3.2',
    pillar: 'social',
    level: 'intermediate',
    topic: 'Diversity, equity and inclusion',
    title: "Company's directors",
    info: 'The share of directors by gender and by age group.',
    fields: genderAndAge('s3_2', 'Directors'),
  },
  {
    code: 'S4.1',
    pillar: 'social',
    level: 'basic',
    topic: 'Occupational health and safety',
    title: "Company's OHS incidents",
    info: 'Work-related deaths and injuries during the year (0 if none).',
    fields: [
      { key: 's4_1_fatalities', label: 'Number of fatalities', kind: 'count' },
      { key: 's4_1_injuries', label: 'Number of injuries', kind: 'count' },
    ],
  },
  {
    code: 'S4.2',
    pillar: 'social',
    level: 'intermediate',
    topic: 'Occupational health and safety',
    title: "Company's OHS training",
    info: 'Employees trained in health and safety standards, as a number and as a share of all employees.',
    fields: [
      { key: 's4_2_trained', label: 'Number of employees trained in health and safety standards', kind: 'count' },
      { key: 's4_2_trained_share', label: 'Percentage of employees trained in health and safety standards', kind: 'percent' },
    ],
  },
  {
    code: 'S5.1',
    pillar: 'social',
    level: 'basic',
    topic: 'Community engagement',
    title: 'Community investments and impacts',
    info: 'Money given to communities during the year: investments, donations and sponsorships.',
    fields: [
      { key: 's5_1', label: 'Total community investment and donations', kind: 'quantity', unit: 'MYR' },
    ],
  },
  {
    code: 'S5.2',
    pillar: 'social',
    level: 'advanced',
    topic: 'Community engagement',
    title: 'Community investments and impacts',
    info: 'Operations that have, or could have, a significant negative impact on local communities.',
    fields: [{ key: 's5_2', label: 'Operations with negative impact on local communities', kind: 'list' }],
  },

  // ---- Governance ----
  {
    code: 'G1.1',
    pillar: 'governance',
    level: 'basic',
    topic: 'Governance structure',
    title: 'Company governance structure',
    info: 'Directors on the board at the end of the year.',
    fields: [{ key: 'g1_1', label: 'Number of directors', kind: 'count' }],
  },
  {
    code: 'G1.2',
    pillar: 'governance',
    level: 'intermediate',
    topic: 'Governance structure',
    title: 'Company governance structure',
    info: 'How the company is governed: the board, its committees and who is responsible for what, including sustainability.',
    fields: [{ key: 'g1_2', label: 'Governance structure', kind: 'list' }],
  },
  {
    code: 'G2.1',
    pillar: 'governance',
    level: 'basic',
    topic: 'Policy commitments',
    title: 'Company policy commitments',
    info: 'The policies the company has in place, e.g. code of conduct, anti-corruption, health and safety, environment, human rights.',
    fields: [{ key: 'g2_1', label: 'List of company policies', kind: 'list' }],
  },
  {
    code: 'G3.1',
    pillar: 'governance',
    level: 'basic',
    topic: 'Risk management and reporting',
    title: "Report company's risk",
    info: 'The financial year of the latest audited financial report the company submitted.',
    fields: [{ key: 'g3_1', label: 'Year of last submitted audited financial report', kind: 'year' }],
  },
  {
    code: 'G3.2',
    pillar: 'governance',
    level: 'intermediate',
    topic: 'Risk management and reporting',
    title: "Report company's risk",
    info: "The main risks to the company's operations and activities.",
    fields: [{ key: 'g3_2', label: "Company's operations and activities risks", kind: 'list' }],
  },
  {
    code: 'G3.3',
    pillar: 'governance',
    level: 'advanced',
    topic: 'Risk management and reporting',
    title: "Report company's risk",
    info: 'Sustainability risks to the company, such as climate change, resource scarcity or changing regulations.',
    fields: [{ key: 'g3_3', label: "Company's sustainability risks", kind: 'list' }],
  },
  {
    code: 'G4.1',
    pillar: 'governance',
    level: 'basic',
    topic: 'Anti-corruption',
    title: 'Incidents of corruption',
    info: 'Confirmed incidents of corruption during the year (0 if none), and what happened.',
    fields: [
      { key: 'g4_1', label: 'Number of confirmed incidents of corruption', kind: 'count' },
      { key: 'g4_1_nature', label: 'Nature of confirmed incidents of corruption, if any', kind: 'list', optional: true },
    ],
  },
  {
    code: 'G4.2',
    pillar: 'governance',
    level: 'intermediate',
    topic: 'Anti-corruption',
    title: 'Training on anti-corruption',
    info: 'Employees trained on anti-bribery and anti-corruption, as a number and as a share of all employees.',
    fields: [
      { key: 'g4_2_trained', label: 'Number of employees trained on anti-bribery and anti-corruption', kind: 'count' },
      { key: 'g4_2_trained_share', label: 'Percentage of employees trained on anti-bribery and anti-corruption', kind: 'percent' },
    ],
  },
  {
    code: 'G4.3',
    pillar: 'governance',
    level: 'advanced',
    topic: 'Anti-corruption',
    title: 'Corruption risks',
    info: 'Where in the business corruption is most likely to happen, e.g. procurement, licences, sales to government.',
    fields: [{ key: 'g4_3', label: 'List of corruption risks', kind: 'list' }],
  },
  {
    code: 'G5.1',
    pillar: 'governance',
    level: 'intermediate',
    topic: 'Customer privacy',
    title: 'Incidents of customer privacy',
    info: "Complaints about breaches of customers' data privacy during the year (0 if none), and what they were about.",
    fields: [
      { key: 'g5_1', label: 'Number of customer data privacy complaints', kind: 'count' },
      { key: 'g5_1_nature', label: 'Nature of customer data privacy complaints, if any', kind: 'list', optional: true },
    ],
  },
]

/** Every field of the report (general information first), by key */
export const SEDG_FIELDS: ReadonlyMap<string, SedgField> = new Map(
  [...SEDG_GENERAL_FIELDS, ...SEDG_DISCLOSURES.flatMap((disclosure) => disclosure.fields)].map((field) => [field.key, field]),
)

/** Which disclosure a field belongs to ("General" for general information) */
export const SEDG_FIELD_CODES: ReadonlyMap<string, string> = new Map([
  ...SEDG_GENERAL_FIELDS.map((field) => [field.key, 'General'] as const),
  ...SEDG_DISCLOSURES.flatMap((disclosure) => disclosure.fields.map((field) => [field.key, disclosure.code] as const)),
])

export const SEDG_LIMITS = {
  /** Characters in a one-line text field */
  text: 300,
  /** Characters in a list or description */
  list: 4000,
  /** Largest number accepted (quantities, money, counts) */
  number: 1e15,
  /** Fields changed in one save */
  changesPerSave: 200,
} as const

export type SedgValue = string | number
export type SedgAnswers = Record<string, SedgValue>

/**
 * Checks one answer and returns it in its stored form (numbers as numbers,
 * text trimmed), or an error message for people. Used by the API (the rule)
 * and the form (to show the problem before saving).
 */
export function parseSedgValue(field: SedgField, raw: unknown): { value: SedgValue } | { error: string } {
  if (field.kind === 'text' || field.kind === 'list') {
    if (typeof raw !== 'string') return { error: 'Enter text.' }
    const text = field.kind === 'text' ? raw.trim().replace(/\s+/g, ' ') : raw.trim()
    if (!text) return { error: 'Enter text.' }
    const max = field.kind === 'text' ? SEDG_LIMITS.text : SEDG_LIMITS.list
    if (text.length > max) return { error: `Use at most ${max.toLocaleString('en')} characters.` }
    return { value: text }
  }

  const number = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw.trim()) : NaN
  if (!Number.isFinite(number)) return { error: 'Enter a number.' }
  if (Math.abs(number) > SEDG_LIMITS.number) return { error: 'This number is too large.' }
  switch (field.kind) {
    case 'percent':
      if (number < 0 || number > 100) return { error: 'Enter a percentage from 0 to 100.' }
      return { value: number }
    case 'count':
      if (!Number.isInteger(number) || number < 0) return { error: 'Enter a whole number, 0 or more.' }
      return { value: number }
    case 'year':
      if (!Number.isInteger(number) || number < 1900 || number > 2100) return { error: 'Enter a year, e.g. 2025.' }
      return { value: number }
    default:
      if (!field.signed && number < 0) return { error: 'Enter 0 or more.' }
      return { value: number }
  }
}

/**
 * Whether a disclosure counts as complete: every field that isn't optional has
 * a value, either entered or calculated.
 */
export function isDisclosureComplete(
  disclosure: Pick<SedgDisclosure, 'fields'>,
  hasValue: (field: SedgField) => boolean,
) {
  return disclosure.fields.every((field) => field.optional || hasValue(field))
}

/** The disclosures a report at this level includes */
export function disclosuresFor(level: SedgLevel) {
  return SEDG_DISCLOSURES.filter((disclosure) => levelIncludes(level, disclosure.level))
}
