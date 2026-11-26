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

/**
 * Builds the PDF in the browser and downloads it. The PDF library (large) is
 * loaded on the first click only, as its own file.
 */
export async function downloadSedgPdf(report: SedgReport) {
  const [{ pdf }, { SedgDocument }] = await Promise.all([import('@react-pdf/renderer'), import('./sedg-pdf')])
  const input = pdfInput(report)
  // If the PDF engine ever stalls (it did when the browser blocked its WebAssembly), say so instead of waiting forever
  const blob = await Promise.race([
    pdf(createElement(SedgDocument, input) as Parameters<typeof pdf>[0]).toBlob(),
    new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(new Error('Creating the PDF took too long. Please try again.')), 60_000),
    ),
  ])
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `SEDG ${report.year} - ${input.companyName || 'report'}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ')
  document.body.append(link)
  link.click()
  link.remove()
  // Give the browser a moment to start the download before the file is released
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
