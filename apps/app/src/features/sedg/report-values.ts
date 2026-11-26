import { createElement } from 'react'
import {
  SEDG_GENERAL_FIELDS,
  SEDG_PILLARS,
  disclosuresFor,
  type SedgField,
  type SedgValue,
} from '@hub/shared/sedg'
import type { SedgReport } from './queries'
import type { PdfInput } from './sedg-pdf'
import { downloadPdf } from '../reports/download-pdf'
import { formatSedgValue, unitOf } from './style'

/** What the report shows for a field: what someone entered, else the calculated figure */
export function shownValue(report: Pick<SedgReport, 'answers' | 'automatic'>, field: SedgField): SedgValue | undefined {
  return report.answers[field.key] ?? (field.auto ? report.automatic[field.auto]?.value : undefined)
}

/** The PDF's content: the report's level, with every value as it reads on the page */
export function pdfInput(report: SedgReport): PdfInput {
  const general = SEDG_GENERAL_FIELDS.filter((field) => field.key !== 'gen_revenue') // only used for E1.7
  return {
    companyName: String(shownValue(report, SEDG_GENERAL_FIELDS[0]!) ?? ''),
    year: report.year,
    level: report.level,
    generatedOn: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    general: general.map((field) => ({ label: field.label, value: formatSedgValue(field, shownValue(report, field)) })),
    pillars: SEDG_PILLARS.map((pillar) => ({
      pillar,
      disclosures: disclosuresFor(report.level)
        .filter((disclosure) => disclosure.pillar === pillar)
        .map((disclosure) => ({
          code: disclosure.code,
          level: disclosure.level,
          topic: disclosure.topic,
          title: disclosure.title,
          rows: disclosure.fields.map((field) => ({
            indicator: field.label,
            value: formatSedgValue(field, shownValue(report, field)),
            unit: unitOf(field),
          })),
        })),
    })),
  }
}

/** The SEDG report as a PDF (built in the browser, see reports/download-pdf.ts) */
export async function downloadSedgPdf(report: SedgReport) {
  const input = pdfInput(report)
  await downloadPdf(
    async () => createElement((await import('./sedg-pdf')).SedgDocument, input),
    `SEDG ${report.year} - ${input.companyName || 'report'}.pdf`,
  )
}
