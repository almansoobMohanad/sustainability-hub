/*
  ESG Ready: MITI's ESG readiness self-assessment (i-ESGReady, part of the
  National Industry ESG framework), one per company per calendar year. The ONE
  list of its questions: the API validates answers with it, the app builds the
  form from it, and the score and PDF are worked out from it.

  The 42 questions and their answers are MITI's, as in the old app (which had
  them all); only a few obvious spelling slips were corrected. Five sections:
  A about the company (not scored), B general understanding of ESG, C
  environment, D social, E governance.

  Scoring (MITI publishes no official rule; this is how MITI's own online tool
  behaved when the user tested it): each scored question's answers go from the
  weakest to the strongest practice and earn 0 to 3 points by their order; Q9
  (stakeholders engaged) earns 1 point per stakeholder, up to 6. 34 x 3 + 6 =
  108 points. The share of 108 gives a band (ESG_BANDS).

  Keys and option ids are STORED (esg_ready_reports.answers): never rename one.
*/

export const ESG_SECTIONS = ['A', 'B', 'C', 'D', 'E'] as const
export type EsgSection = (typeof ESG_SECTIONS)[number]

/** The scored sections (A, about the company, isn't scored) */
export const ESG_SCORED_SECTIONS = ['B', 'C', 'D', 'E'] as const
export type EsgScoredSection = (typeof ESG_SCORED_SECTIONS)[number]

export const ESG_SECTION_TITLES: Record<EsgSection, string> = {
  A: 'About the company',
  B: 'General understanding of ESG',
  C: 'Environment',
  D: 'Social',
  E: 'Governance',
}

/** Filled in from the company's data until someone enters their own */
export type EsgAutoValue = 'companyName' | 'userEmail'

/*
  What a field holds:
    choice  one answer, shown as a list of statements
    select  one answer from a long list (a dropdown)
    multi   several answers (`exclusive`: an answer that can't be combined with others, "None of the above")
    text    one short line
*/
export type EsgFieldKind = 'choice' | 'select' | 'multi' | 'text'

export type EsgOption = { id: string; label: string }

export type EsgField = {
  /** Stored key; never rename */
  key: string
  kind: EsgFieldKind
  /** Only for questions with several fields (otherwise the question is the label) */
  label?: string
  options?: EsgOption[]
  /** Counts towards the readiness score */
  scored?: boolean
  exclusive?: string
  auto?: EsgAutoValue
  /** Only asked when another field's answer includes this option */
  showIf?: { key: string; includes: string }
}

export type EsgQuestion = {
  number: number
  section: EsgSection
  title: string
  fields: EsgField[]
  /** Only asked when another field's answer includes this option */
  showIf?: { key: string; includes: string }
}

export const ESG_QUESTIONS: EsgQuestion[] = [
  {
    number: 1,
    section: 'A',
    title: 'Company details',
    fields: [
      { key: 'company_name', kind: 'text', label: 'Company name', auto: 'companyName' },
      { key: 'email', kind: 'text', label: 'Email address', auto: 'userEmail' },
      { key: 'phone', kind: 'text', label: 'Phone number' },
    ],
  },
  {
    number: 2,
    section: 'A',
    title: 'Where is your company located?',
    fields: [
      { key: 'location', kind: 'select', options: [
          { id: 'kuala_lumpur', label: 'W.P Kuala Lumpur' },
          { id: 'selangor', label: 'Selangor' },
          { id: 'negeri_sembilan', label: 'Negeri Sembilan' },
          { id: 'johor', label: 'Johor' },
          { id: 'penang', label: 'Penang' },
          { id: 'melaka', label: 'Melaka' },
          { id: 'kedah', label: 'Kedah' },
          { id: 'perak', label: 'Perak' },
          { id: 'perlis', label: 'Perlis' },
          { id: 'pahang', label: 'Pahang' },
          { id: 'kelantan', label: 'Kelantan' },
          { id: 'terengganu', label: 'Terengganu' },
          { id: 'sabah', label: 'Sabah' },
          { id: 'sarawak', label: 'Sarawak' },
        ] },
    ],
  },
  {
    number: 3,
    section: 'A',
    title: 'What is your company\'s sub-sector?',
    fields: [
      { key: 'subsector', kind: 'select', options: [
          { id: 'ee', label: 'E&E' },
          { id: 'chemical_and_petrochemical_products', label: 'Chemical & Petrochemical products' },
          { id: 'rubber_and_plastic_products', label: 'Rubber & plastic products' },
          { id: 'fb', label: 'F&B' },
          { id: 'textiles_and_wearing_apparel', label: 'Textiles and wearing apparel' },
          { id: 'wood_and_paper_products', label: 'Wood & paper products' },
          { id: 'iron_and_steel_and_other_basic_metal_products', label: 'Iron & steel and other basic metal products' },
          { id: 'non_metallic_mineral_products', label: 'Non-metallic mineral products' },
          { id: 'pharmaceuticals', label: 'Pharmaceuticals' },
          { id: 'medical_devices', label: 'Medical devices' },
          { id: 'machinery_and_equipment', label: 'Machinery & Equipment' },
          { id: 'motor_vehicles_and_transport_equipment', label: 'Motor vehicles & Transport equipment' },
          { id: 'other', label: 'Other (please specify)' },
        ] },
      { key: 'subsector_other', kind: 'text', label: 'Sub-sector', showIf: { key: 'subsector', includes: 'other' } },
    ],
  },
  {
    number: 4,
    section: 'A',
    title: 'What is your company\'s size?',
    fields: [
      { key: 'company_size', kind: 'choice', options: [
          { id: 'micro', label: 'Micro (sales: <RM300,000; employees: <5)' },
          { id: 'small', label: 'Small (sales: RM300,000 ≤ RM15 mil; employees: 5 to < 30)' },
          { id: 'medium', label: 'Medium (sales: RM15 mil < RM50 mil; employees: 30 to ≤ 75)' },
          { id: 'large', label: 'Large (sales: >RM50 mil; employees: >75)' },
        ] },
    ],
  },
  {
    number: 5,
    section: 'A',
    title: 'What is your company\'s market orientation?',
    fields: [
      { key: 'company_type', kind: 'choice', options: [
          { id: 'export', label: 'Export-oriented (More than 60% of the products are exported)' },
          { id: 'domestic', label: 'Domestic-oriented (Less than 60% of the products are exported)' },
        ] },
    ],
  },
  {
    number: 6,
    section: 'A',
    title: 'Which sustainability reporting standards does your organization use?',
    fields: [
      { key: 'reporting_standard', kind: 'multi', exclusive: 'none', options: [
          { id: 'gri', label: 'GRI' },
          { id: 'tcfd', label: 'TCFD' },
          { id: 'cdp', label: 'CDP' },
          { id: 'bursa', label: 'Bursa' },
          { id: 'sasb', label: 'SASB' },
          { id: 'ftse4good', label: 'FTSE4Good' },
          { id: 'business_review_report_by_ssm', label: 'Business Review Report by SSM' },
          { id: 'other', label: 'Other (please specify)' },
          { id: 'none', label: 'None of the above' },
        ] },
      { key: 'reporting_standard_other', kind: 'text', label: 'Other standard', showIf: { key: 'reporting_standard', includes: 'other' } },
    ],
  },
  {
    number: 7,
    section: 'A',
    title: 'If you selected \'None\' in Q6, please explain why',
    showIf: { key: 'reporting_standard', includes: 'none' },
    fields: [
      { key: 'none_reason', kind: 'multi', options: [
          { id: 'not_sure_where_to_begin', label: 'Not sure where to begin' },
          { id: 'do_not_have_the_skills', label: 'Do not have the skills' },
          { id: 'do_not_have_the_tools', label: 'Do not have the tools' },
          { id: 'too_costly', label: 'Too costly' },
          { id: 'other', label: 'Other (please specify)' },
        ] },
      { key: 'none_reason_other', kind: 'text', label: 'Other reason', showIf: { key: 'none_reason', includes: 'other' } },
    ],
  },
  {
    number: 8,
    section: 'B',
    title: 'How mature is your organization\'s sustainability strategy?',
    fields: [
      { key: 'q8_maturity', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'We have not started our sustainability journey yet' },
          { id: 'b', label: 'We have started, but we should be doing more' },
          { id: 'c', label: 'We are progressing well, but there is room for improvement' },
          { id: 'd', label: 'We are very advanced' },
        ] },
    ],
  },
  {
    number: 9,
    section: 'B',
    title: 'Which stakeholders do you actively engage with?',
    fields: [
      { key: 'q9_stakeholders', kind: 'multi', scored: true, exclusive: 'none', options: [
          { id: 'customers', label: 'Customers' },
          { id: 'employees', label: 'Employees' },
          { id: 'board_of_directors', label: 'Board of directors' },
          { id: 'investors', label: 'Investors' },
          { id: 'financiers', label: 'Financiers' },
          { id: 'community', label: 'Community' },
          { id: 'none', label: 'None of the above' },
        ] },
    ],
  },
  {
    number: 10,
    section: 'B',
    title: 'Which statement best describes your ESG business case?',
    fields: [
      { key: 'q10_business_case', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Organization does not understand how ESG can present opportunities to enhance revenue, reduce costs, improve risk management, etc' },
          { id: 'b', label: 'The Organization follows some regulation that are related to ESG practices to comply with local legal requirements (Minimum wage, Act 446 etc)' },
          { id: 'c', label: 'The Organization adopts ESG practices at overall level but does not quantify it to revenue generation and cost reduction, etc' },
          { id: 'd', label: 'The Organization has a clear understanding of ESG practices, with ESG activities clearly contributing to revenue growth, helping to reduce costs and manage risk, beneficial to employee engagement, etc' },
        ] },
    ],
  },
  {
    number: 11,
    section: 'B',
    title: 'How would you describe your ESG targets and goals?',
    fields: [
      { key: 'q11_esg_goals', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Organization has no targets and goals in relation to ESG commitments' },
          { id: 'b', label: 'The Organization has some goals and targets relating to ESG but these are not well organized and are not comprehensive' },
          { id: 'c', label: 'The Organization has a well-defined set of goals and targets relating to ESG' },
          { id: 'd', label: 'The Organization has a set of comprehensive targets and goals that it wishes to achieve with deadlines, and communicates such targets and goals publicly and within the Organization, including KPIs' },
        ] },
    ],
  },
  {
    number: 12,
    section: 'B',
    title: 'Who leads ESG in your organization?',
    fields: [
      { key: 'q12_esg_leadership', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'There is no clear ESG leader within the Organization' },
          { id: 'b', label: 'Led by officer who has multiple roles in the Organization such as HR, Admin and Finance' },
          { id: 'c', label: 'There is a leader within the Organization to ESG matters who has limited authority' },
          { id: 'd', label: 'Organization has a clear ESG leader (Chief Sustainability Officer) with clear KPIs and targets, who has the role and authority to drive the ESG program, reports to the Board and makes decisions' },
        ] },
    ],
  },
  {
    number: 13,
    section: 'B',
    title: 'How do you report on ESG?',
    fields: [
      { key: 'q13_esg_reporting', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Organization doesn\'t disclose information on its ESG impact and agenda and doesn\'t have an ESG rating' },
          { id: 'b', label: 'The Organization provides limited information on ESG in its non-financial reporting, and does not report against a known framework such as GRI or TCFD' },
          { id: 'c', label: 'The Organization includes significant information on ESG matters in its non-financial reporting but has limited interaction with rating agencies' },
          { id: 'd', label: 'The Organization has solicited an ESG rating from a recognised rating agency such as GRI and TCFD and the management communicates regularly with the rating agency' },
        ] },
    ],
  },
  {
    number: 14,
    section: 'B',
    title: 'How well do you understand the data required for external ESG reporting?',
    fields: [
      { key: 'q14_data_understanding', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Organization has not assessed what data is required for any sustainability reporting' },
          { id: 'b', label: 'The Organization has a limited understanding of the data required for sustainability reporting' },
          { id: 'c', label: 'The Organization has a good understanding of the data required for sustainability reporting and report them externally' },
          { id: 'd', label: 'The Organization has assessed what data is required for external reporting of ESG matters and has put in place processes to be able to publish external reports in high quality and detail (GRI, TCFD, etc)' },
        ] },
    ],
  },
  {
    number: 15,
    section: 'B',
    title: 'Does your ESG program cover the key E, S, and G elements identified by stakeholders?',
    fields: [
      { key: 'q15_esg_elements', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'There is no ESG program within the Organization' },
          { id: 'b', label: 'The Organization has a limited plan in place that deals with only some limited aspects of E, S and G' },
          { id: 'c', label: 'The Organization has a solid selected ESG programs in place across some elements of E, S and G' },
          { id: 'd', label: 'The Organization has a comprehensive ESG program in place that covers appropriately and completely all areas of E, S and G that have been determined to be of importance to the Organization and its stakeholders based on the ESG strategy' },
        ] },
    ],
  },
  {
    number: 16,
    section: 'B',
    title: 'How are your ESG disclosures validated?',
    fields: [
      { key: 'q16_validation', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'There is no independent external validation of the ESG information and data reported publicly by the Organization, or no information is reported' },
          { id: 'b', label: 'The Organization has internal auditor and considering the use of external auditors to validate the information published in the non-financial disclosures' },
          { id: 'c', label: 'The Organization has its external ESG reporting verified/audited by an external auditor' },
          { id: 'd', label: 'The Organization has its public communications and reporting on ESG independently reviewed and verified by an external specialised company' },
        ] },
    ],
  },
  {
    number: 17,
    section: 'C',
    title: 'What is your carbon footprint reduction approach and ambition?',
    fields: [
      { key: 'q17_carbon', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Organization has no Carbon Footprint Reduction program due to lack of knowledge on the methodology' },
          { id: 'b', label: 'The Organization has decided and published modest carbon footprint reduction goals' },
          { id: 'c', label: 'The Organization has decided and published ambitious carbon footprint reduction goals. A comprehensive programme has been established to attain the goals' },
          { id: 'd', label: 'The Organization has publicly communicated a Net Zero target and commitments, and has a comprehensive plan and resources in place to achieve them, including reporting the progress on a regular basis' },
        ] },
    ],
  },
  {
    number: 18,
    section: 'C',
    title: 'How do you manage and reduce GHG emissions?',
    fields: [
      { key: 'q18_ghg', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Organization has no GHG Emissions monitoring in place, with no specific targets, and no goals publicly communicated' },
          { id: 'b', label: 'The Organization has published GHG emissions and decided on the reduction goals' },
          { id: 'c', label: 'The Organization has decided and published ambitious GHG emissions reduction goals. A comprehensive programme has been established to attain the goals' },
          { id: 'd', label: 'The Organization has publicly communicated a GHG emissions monitoring, and has a comprehensive plan and resources in place to achieve them, including reporting the progress on a regular basis' },
        ] },
    ],
  },
  {
    number: 19,
    section: 'C',
    title: 'How do you manage water efficiency?',
    fields: [
      { key: 'q19_water', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Organization has no water efficiency management' },
          { id: 'b', label: 'The Organization has decided and published modest water efficiency management' },
          { id: 'c', label: 'The Organization monitor and report water use and quality by tracking these metrics, businesses can identify areas for improvement and demonstrate their commitment to water stewardship' },
          { id: 'd', label: 'The Organization has Implemented water-efficient technologies and practices: This includes measures such as water-efficient irrigation and using recycled water' },
        ] },
    ],
  },
  {
    number: 20,
    section: 'C',
    title: 'How do you manage materials, waste, and effluent impacts?',
    fields: [
      { key: 'q20_waste', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Organization has no sustainable material sourcing management' },
          { id: 'b', label: 'The Organization has decided and published modest sustainable material sourcing management' },
          { id: 'c', label: 'The Organization has practised a comprehensive waste-related impact management' },
          { id: 'd', label: 'The Organization has an extensive action on waste-related impacts management' },
        ] },
    ],
  },
  {
    number: 21,
    section: 'C',
    title: 'How do you manage wastewater?',
    fields: [
      { key: 'q21_wastewater', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Organization has no effort to improve the quality of its wastewater and discharged water management' },
          { id: 'b', label: 'The Organization record and report the amount of water used by the company' },
          { id: 'c', label: 'The Organization has an extensive effort to improve the quality of its wastewater and discharged water such minimising wastewater' },
          { id: 'd', label: 'The Organization has communicated about waste-water by engaging with stakeholders, including local communities, water authorities, and NGOs, to understand local water-related risks and opportunities and to develop solutions collaboratively' },
        ] },
    ],
  },
  {
    number: 22,
    section: 'C',
    title: 'How do you manage and reduce energy consumption?',
    fields: [
      { key: 'q22_energy', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Organization has no efficient practise on energy consumed – electricity, gas or steam water' },
          { id: 'b', label: 'The Organization has minimum effort to reduce energy consumption such as switching off the light during lunch hour' },
          { id: 'c', label: 'The Organization record and control the energy consumption, and gradually reduce and optimise energy consumption' },
          { id: 'd', label: 'The Organization maximize energy efficiency by taking a holistic approach: consider low-cost and high-impact changes such as installing solar panels' },
        ] },
    ],
  },
  {
    number: 23,
    section: 'C',
    title: 'How do you address biodiversity impacts?',
    fields: [
      { key: 'q23_biodiversity', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Organization has no effort to preserve and conserve the survival of biodiversity' },
          { id: 'b', label: 'The Organization has minimal efforts of in ensuring the survival of biodiversity' },
          { id: 'c', label: 'The Organization always consider their operation with the respect to its impact on biodiversity' },
          { id: 'd', label: 'The Organization has implemented prevention and remediation activities with respect to its impact on biodiversity by collaborating with NGOs' },
        ] },
    ],
  },
  {
    number: 24,
    section: 'C',
    title: 'Do you use eco-friendly raw materials?',
    fields: [
      { key: 'q24_eco_materials', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Organization does not use eco-friendly raw material in business operation' },
          { id: 'b', label: 'The Organization exploring and planning to use eco-friendly raw materials in business operation (e.g. recycled rubber, biodegradable plastics, compostable straws and others)' },
          { id: 'c', label: 'The Organization uses eco-friendly raw materials in business operation (e.g. recycled rubber, biodegradable plastics, compostable straws and others)' },
          { id: 'd', label: 'The Organization only uses eco-friendly raw materials in business operation (e.g. recycled rubber, biodegradable plastics, compostable straws and others)' },
        ] },
    ],
  },
  {
    number: 25,
    section: 'C',
    title: 'Do you conduct or support reforestation activities?',
    fields: [
      { key: 'q25_reforestation', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Organization does not conduct any reforestation program' },
          { id: 'b', label: 'Organization planning to implement reforestation program' },
          { id: 'c', label: 'Organization has initiated an in-house reforestation program to contribute to environmental sustainability' },
          { id: 'd', label: 'Organization has conducted thorough assessments of deforested areas and collaborate with environmental experts and local communities to implement sustainable reforestation strategies' },
        ] },
    ],
  },
  {
    number: 26,
    section: 'D',
    title: 'How involved are employees in your ESG efforts?',
    fields: [
      { key: 'q26_employee_involvement', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Organization does not address ESG matters with its employees and does not solicit feedback or input from its employees' },
          { id: 'b', label: 'Employees are involved, but mostly in community actions and social matters' },
          { id: 'c', label: 'The Board sponsors initiatives in the ESG space and communication on such initiatives internally with employees' },
          { id: 'd', label: 'The Organization extensively communicates with its employees on the importance of ESG, the Organization\'s ESG programme and how employees can be involved in and support the ESG aspirations of the Organization' },
        ] },
    ],
  },
  {
    number: 27,
    section: 'D',
    title: 'How do you comply with domestic labour laws and regulations?',
    fields: [
      { key: 'q27_domestic_labour', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Organisation is unaware with the labour laws and regulations in the country' },
          { id: 'b', label: 'The Organization strives to comply with all basic labour laws and regulations in the country' },
          { id: 'c', label: 'The Organization is committed in maintaining a comprehensive understanding of labour laws and regulations. The organization actively train employees on their rights and responsibilities, conduct internal audits, and promptly address any compliance gaps that may arise' },
          { id: 'd', label: 'The Organization goes beyond mere compliance and takes a proactive approach to stay ahead of changes in labour laws and regulations. Dedicated teams were formed to engage with Labour Department and Ministry of Human Resource, and a robust systems in place for interpreting complex labour laws, managing external audits, and continuously improving processes to ensure ongoing compliance' },
        ] },
    ],
  },
  {
    number: 28,
    section: 'D',
    title: 'How do you align with international labour laws and standards?',
    fields: [
      { key: 'q28_intl_labour', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Organization lack of understanding on the international labour laws and regulations' },
          { id: 'b', label: 'The organization recognizes the importance of complying with basic international labour laws and regulations, and adhere to fundamental principles' },
          { id: 'c', label: 'The Organization is up to date with a wide range of international labour laws and regulations, actively monitor and comply with standards set by organizations such as the International Labour Organization (ILO)' },
          { id: 'd', label: 'The Organization proactively engage in continuous improvement initiatives, regularly conduct internal audits, and participate in external certifications to demonstrate high standards commitment of labor practices' },
        ] },
    ],
  },
  {
    number: 29,
    section: 'D',
    title: 'How do you ensure equal employment and promotion opportunities?',
    fields: [
      { key: 'q29_equal_employment', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'Organization does not set target to achieve equal employment and promotion opportunities' },
          { id: 'b', label: 'Organization is committed to providing equal employment and promotion opportunities to all employees, and adhere to the basic principles of fairness and non-discrimination' },
          { id: 'c', label: 'Organization actively promotes diversity and inclusion in the workforce by implementing policies and practices that prevent discrimination based on factors such as race, gender, age, religion, and disability. Training and awareness programs provided to foster an inclusive environment and ensure fair treatment throughout the employment lifecycle' },
          { id: 'd', label: 'Organization has implemented comprehensive strategies to proactively identify and address any systemic barriers that may hinder equal opportunities through mentorship and sponsorship programs, internal mobility initiatives, and talent development programs to ensure that individuals from all backgrounds have equal access to career advancement and promotional opportunities' },
        ] },
    ],
  },
  {
    number: 30,
    section: 'D',
    title: 'How do you meet or exceed minimum wage requirements?',
    fields: [
      { key: 'q30_min_wage', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'Organization pays wages lower than the national minimum wage requirement' },
          { id: 'b', label: 'Organization ensures that all employees are paid at least the minimum wage mandated by the applicable labour laws and regulations' },
          { id: 'c', label: 'Organization not only meets the minimum wage requirements but also considers factors such as cost of living and industry standards when determining employee compensation. Periodic reviews is conducted to ensure that wage rates remain competitive and equitable within the industry' },
          { id: 'd', label: 'Organization proactively assess and adjust the compensation structure to provide a living wage that enables employees to meet their basic needs and maintain a decent standard of living, and adopt progressive wage policies to support the financial well-being to the workforce' },
        ] },
    ],
  },
  {
    number: 31,
    section: 'D',
    title: 'How do you manage occupational health and safety?',
    fields: [
      { key: 'q31_health_safety', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'Organization does not meet with the basic safety requirement' },
          { id: 'b', label: 'Organization provide a safe and healthy work environment by identifying and addressing potential hazards, providing basic safety training to employees, and implementing necessary safety measures' },
          { id: 'c', label: 'Organization actively maintains compliance with OSHA regulations by regularly conducting comprehensive workplace risk assessments and implementing appropriate control measures. Safety committees is established to provide ongoing safety training programs, and maintain records of incidents and near-misses to continuously improve safety practices' },
          { id: 'd', label: 'Organization adopting proactive safety measures and promoting a culture of safety throughout the workforce. Conduct regular safety audit, engage employees in safety programs and initiatives, and invest in advanced technologies and equipment to enhance workplace safety according to OSHA' },
        ] },
    ],
  },
  {
    number: 32,
    section: 'D',
    title: 'Do you have a formal grievance handling process?',
    fields: [
      { key: 'q32_grievance', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'Organization does not practice a formal grievance handling procedures' },
          { id: 'b', label: 'Organization has established a basic formal grievance handling procedure to address employee concerns and complaints' },
          { id: 'c', label: 'Organization has developed a comprehensive formal grievance handling procedure that includes clear guidelines and steps for reporting, investigating, and resolving grievances. Designated personnel being trained to handle grievances effectively' },
          { id: 'd', label: 'Organization has established multiple channels for employees to report grievances, including anonymous options, and actively promote a culture of transparency and trust. Regular audits of the grievance handling process conducted to identify areas for improvement and ensure that resolutions are fair and sustainable' },
        ] },
    ],
  },
  {
    number: 33,
    section: 'D',
    title: 'How do you upskill and develop your workforce?',
    fields: [
      { key: 'q33_upskilling', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'Organization does not conduct regular training to upskill workers' },
          { id: 'b', label: 'Organization recognizes the importance of training and conduct basic skills development programs for workers' },
          { id: 'c', label: 'Organization is committed to the continuous upskilling of workers and conducts regular training programs to improve their technical skills and knowledge' },
          { id: 'd', label: 'Organization takes a proactive approach to upskilling workers and invests significantly in their professional development. Robust training and development framework is introduced that includes comprehensive skill enhancement programs, leadership development initiatives, and access to advanced learning resources' },
        ] },
    ],
  },
  {
    number: 34,
    section: 'D',
    title: 'How do you contribute to and support the community?',
    fields: [
      { key: 'q34_community', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'Organization does not provide sponsorships or donations to the community' },
          { id: 'b', label: 'Organization provides basic sponsorships or donations to local community organizations or events' },
          { id: 'c', label: 'Organization actively engages in community outreach and support by providing regular sponsorships or donations to various community organizations, nonprofits, and social causes' },
          { id: 'd', label: 'Organization is deeply committed to corporate social responsibility and actively invest in the betterment of the community. Establish dedicated programs and initiatives to support community development, education, healthcare, and environmental sustainability' },
        ] },
    ],
  },
  {
    number: 35,
    section: 'E',
    title: 'How involved is the Board in ESG leadership?',
    fields: [
      { key: 'q35_board_leadership', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Board is not involved in ESG matters' },
          { id: 'b', label: 'Leadership is delegated to one board member' },
          { id: 'c', label: 'Organization has a dedicated board sub-committee for ESG matters' },
          { id: 'd', label: 'The Board takes clear active leadership on the ESG agenda and regularly discusses risk and opportunities. The ESG agenda and company plans are communicated internally throughout the Organization' },
        ] },
    ],
  },
  {
    number: 36,
    section: 'E',
    title: 'How aware are the Board and management of ESG risks and regulations?',
    fields: [
      { key: 'q36_board_awareness', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'The Board or management team have a low understanding of the risk management and regulatory environment affecting their business with regard to ESG topics and are not taking a coordinated approach to ensuring regulatory compliance' },
          { id: 'b', label: 'The Organization has a limited understanding of the risk and regulatory impacts of ESG and is implementing change based on individual directives rather than having a comprehensive approach' },
          { id: 'c', label: 'The Board and management are actively dealing with ESG risks and regulatory requirement with a good understanding of the implications of the regulations' },
          { id: 'd', label: 'The Board and management have strong expertise in the ESG risks management and regulations areas relating to ESG as they impact the business, and have clear and comprehensive programmes in place' },
        ] },
    ],
  },
  {
    number: 37,
    section: 'E',
    title: 'How would you describe your organization\'s strategy?',
    fields: [
      { key: 'q37_strategy', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'Organization does not have a documented vision, mission, values and principles' },
          { id: 'b', label: 'Organization has a basic strategy in place to guide operations and decision-making' },
          { id: 'c', label: 'Organization has developed a comprehensive strategy that aligns with long-term mission, vision and principle' },
          { id: 'd', label: 'Organization has an advanced and dynamic strategy that enables to stay ahead of the competition and drive sustainable growth' },
        ] },
    ],
  },
  {
    number: 38,
    section: 'E',
    title: 'How is your Code of Conduct communicated?',
    fields: [
      { key: 'q38_code_conduct', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'Organization does not publish code of conduct' },
          { id: 'b', label: 'Organization has a basic communication process for the Code of Conduct' },
          { id: 'c', label: 'Organization has implemented a comprehensive communication plan for the Code of Conduct' },
          { id: 'd', label: 'Organization excels in the communication of the Code of Conduct through robust communication strategy that includes multiple channels and methods to reach all employees effectively' },
        ] },
    ],
  },
  {
    number: 39,
    section: 'E',
    title: 'What anti-corruption management system do you have?',
    fields: [
      { key: 'q39_anti_corruption', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'Organization does not have any anti-corruption management system' },
          { id: 'b', label: 'Organization has a basic in-house anti-corruption management system in place.' },
          { id: 'c', label: 'Organization has implemented a comprehensive anti-corruption management system. Established clear procedures and controls to prevent corruption in all aspects of operations' },
          { id: 'd', label: 'Organization has incorporated anti-corruption management system comprehensively and obtained internationally recognized certifications such as ISO 37001: Anti-Bribery Management Systems. The anti-bribery policies and procedures are integrated into our overall governance framework' },
        ] },
    ],
  },
  {
    number: 40,
    section: 'E',
    title: 'Do you have an effective whistleblower program?',
    fields: [
      { key: 'q40_whistleblower', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'Organization does not have any whistleblower program' },
          { id: 'b', label: 'Organization is planning to have a whistleblower program' },
          { id: 'c', label: 'Organization has developed a comprehensive whistle blower procedure that includes clear guidelines and steps for reporting, investigating, and resolving. Designated team is formed to handle complaints effectively' },
          { id: 'd', label: 'Organization has established multiple channels to report any types of corruption and actively promote a culture of transparency and trust. Regular audits of the complaint handling process conducted to identify areas for improvement and ensure that resolutions are fair' },
        ] },
    ],
  },
  {
    number: 41,
    section: 'E',
    title: 'How robust and transparent is your accounting system?',
    fields: [
      { key: 'q41_accounting', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'Organization does not have an accurate and transparent accounting method' },
          { id: 'b', label: 'Organization has basic accounting system such as P&L, Balance Sheet and Cash Flow' },
          { id: 'c', label: 'Organization uses a standard accounting method' },
          { id: 'd', label: 'Organization uses accurate and transparent accounting method that verified by external expertise' },
        ] },
    ],
  },
  {
    number: 42,
    section: 'E',
    title: 'How do you protect privacy and manage data security?',
    fields: [
      { key: 'q42_data_privacy', kind: 'choice', scored: true, options: [
          { id: 'a', label: 'Organization does not have a clear data protection, privacy and data protection scheme' },
          { id: 'b', label: 'Organization is planning to set a clear data protection, privacy and data protection scheme' },
          { id: 'c', label: 'Organization has a basic data protection, privacy and data protection scheme according to Personal Data Protection Act 2010' },
          { id: 'd', label: 'Organization has a comprehensive data protection, privacy and data protection scheme according to Personal Data Protection Act 2010, Computer Crime Act 1997 and Consumer Protection Act 1999' },
        ] },
    ],
  },
]

export type EsgValue = string | string[]
export type EsgAnswers = Record<string, EsgValue>

/** Every field, by key */
export const ESG_FIELDS: ReadonlyMap<string, EsgField> = new Map(
  ESG_QUESTIONS.flatMap((question) => question.fields).map((field) => [field.key, field]),
)

/** The question number a field belongs to */
export const ESG_FIELD_QUESTION: ReadonlyMap<string, number> = new Map(
  ESG_QUESTIONS.flatMap((question) => question.fields.map((field) => [field.key, question.number] as const)),
)

export const ESG_LIMITS = {
  /** Characters in a text field */
  text: 300,
  /** Fields changed in one save */
  changesPerSave: 100,
} as const

/** Whether a question or field is asked, given the answers so far */
export function isAsked(condition: EsgQuestion['showIf'], answers: Partial<EsgAnswers>) {
  if (!condition) return true
  const answer = answers[condition.key]
  return Array.isArray(answer) ? answer.includes(condition.includes) : answer === condition.includes
}

/**
 * Checks one answer and returns it in its stored form, or an error message
 * for people. Used by the API (the rule) and the form.
 */
export function parseEsgValue(field: EsgField, raw: unknown): { value: EsgValue } | { error: string } {
  if (field.kind === 'text') {
    if (typeof raw !== 'string' || !raw.trim()) return { error: 'Enter text.' }
    const text = raw.trim().replace(/\s+/g, ' ')
    if (text.length > ESG_LIMITS.text) return { error: `Use at most ${ESG_LIMITS.text} characters.` }
    return { value: text }
  }
  const ids = new Set((field.options ?? []).map((option) => option.id))
  if (field.kind === 'multi') {
    if (!Array.isArray(raw) || raw.length === 0) return { error: 'Choose at least one answer.' }
    if (!raw.every((item) => typeof item === 'string' && ids.has(item))) return { error: 'Choose from the answers given.' }
    const chosen = [...new Set(raw as string[])]
    if (field.exclusive && chosen.includes(field.exclusive) && chosen.length > 1) {
      return { error: `"${field.options!.find((option) => option.id === field.exclusive)!.label}" can't be combined with other answers.` }
    }
    // Stored in the order of the answers, whatever order they were ticked in
    return { value: field.options!.map((option) => option.id).filter((id) => chosen.includes(id)) }
  }
  if (typeof raw !== 'string' || !ids.has(raw)) return { error: 'Choose one of the answers given.' }
  return { value: raw }
}

/** Whether a question is answered: every field it asks has a value (text fields of "Other" included) */
export function isQuestionAnswered(question: EsgQuestion, hasValue: (field: EsgField) => boolean, answers: Partial<EsgAnswers>) {
  return question.fields.every((field) => !isAsked(field.showIf, answers) || hasValue(field))
}

/** The questions asked, given the answers so far (Q7 only after "None" in Q6) */
export const askedQuestions = (answers: Partial<EsgAnswers>) => ESG_QUESTIONS.filter((question) => isAsked(question.showIf, answers))

/** Points of one scored field: the answer's place in the list (0-3), or 1 per stakeholder (max 6) */
export function fieldPoints(field: EsgField, value: EsgValue | undefined) {
  if (!field.scored || value === undefined) return 0
  if (Array.isArray(value)) return Math.min(value.filter((id) => id !== field.exclusive).length, 6)
  return Math.max(0, field.options!.findIndex((option) => option.id === value))
}

export function fieldMaxPoints(field: EsgField) {
  if (!field.scored) return 0
  return field.kind === 'multi' ? 6 : field.options!.length - 1
}

export const ESG_BANDS = [
  { min: 80, label: 'Excellent', description: 'Strong ESG readiness and maturity' },
  { min: 60, label: 'Good progress', description: 'On the right track, with room for improvement' },
  { min: 40, label: 'Developing', description: 'The ESG journey has started; it needs more comprehensive implementation' },
  { min: 0, label: 'Getting started', description: 'Early stages of ESG implementation' },
] as const

export const esgBand = (percent: number) => ESG_BANDS.find((band) => percent >= band.min)!

/** The readiness score: per scored section and in total (unanswered questions earn 0) */
export function esgScore(answers: Partial<EsgAnswers>) {
  const sections = Object.fromEntries(
    ESG_SCORED_SECTIONS.map((section) => {
      const fields = ESG_QUESTIONS.filter((question) => question.section === section).flatMap((question) => question.fields)
      return [
        section,
        {
          points: fields.reduce((sum, field) => sum + fieldPoints(field, answers[field.key]), 0),
          max: fields.reduce((sum, field) => sum + fieldMaxPoints(field), 0),
        },
      ]
    }),
  ) as Record<EsgScoredSection, { points: number; max: number }>
  const points = ESG_SCORED_SECTIONS.reduce((sum, section) => sum + sections[section].points, 0)
  const max = ESG_SCORED_SECTIONS.reduce((sum, section) => sum + sections[section].max, 0)
  const percent = max ? Math.round((points / max) * 1000) / 10 : 0
  return { points, max, percent, band: esgBand(percent), sections }
}
