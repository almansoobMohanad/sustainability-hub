import { createElement } from 'react'
import {
  ESG_SECTIONS,
  ESG_SECTION_TITLES,
  ESG_SCORED_SECTIONS,
  askedQuestions,
  esgScore,
  fieldMaxPoints,
  fieldPoints,
  isAsked,
  isQuestionAnswered,
  type EsgAnswers,
  type EsgField,
  type EsgValue,
} from '@hub/shared/esg-ready'
import { downloadPdf } from '../reports/download-pdf'
import type { PdfInput } from './esg-pdf'
import type { EsgReadyReport } from './queries'

/** What a field shows: the answer given, else (for the company name and email) the filled-in value */
export function shownValue(
  field: EsgField,
  answers: Partial<EsgAnswers>,
  automatic: EsgReadyReport['automatic'],
): EsgValue | undefined {
  return answers[field.key] ?? (field.auto ? automatic[field.auto]?.value || undefined : undefined)
}

/** An answer in words: the option's text, several joined, or the text itself */
export function answerText(field: EsgField, value: EsgValue | undefined) {
  if (value === undefined) return ''
  if (field.kind === 'text') return String(value)
  const label = (id: string) => field.options?.find((option) => option.id === id)?.label ?? id
  return Array.isArray(value) ? value.map(label).join('; ') : label(value)
}

/** Answered / asked questions, for the progress and the jump list */
export function progress(answers: Partial<EsgAnswers>, automatic: EsgReadyReport['automatic']) {
  const asked = askedQuestions(answers)
  const answered = asked.filter((question) =>
    isQuestionAnswered(question, (field) => shownValue(field, answers, automatic) !== undefined, answers),
  )
  return { asked, answered: new Set(answered.map((question) => question.number)) }
}

/** The PDF's content, from the answers as they are on screen */
export function pdfInput(report: EsgReadyReport, answers: Partial<EsgAnswers>): PdfInput {
  const score = esgScore(answers)
  const { asked, answered } = progress(answers, report.automatic)
  const companyName = String(shownValue({ key: 'company_name', kind: 'text', auto: 'companyName' }, answers, report.automatic) ?? '')
  return {
    companyName,
    year: report.year,
    generatedOn: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    score: { percent: score.percent, points: score.points, max: score.max, band: score.band.label, description: score.band.description },
    sectionScores: ESG_SCORED_SECTIONS.map((section) => ({ id: section, title: ESG_SECTION_TITLES[section], ...score.sections[section] })),
    answered: answered.size,
    asked: asked.length,
    sections: ESG_SECTIONS.map((section) => {
      const scored = section === 'A' ? undefined : score.sections[section]
      return {
        id: section,
        title: ESG_SECTION_TITLES[section],
        summary: scored
          ? `${scored.points} of ${scored.max} points (${scored.max ? Math.round((scored.points / scored.max) * 100) : 0}%)`
          : 'Not scored',
        questions: asked
          .filter((question) => question.section === section)
          .map((question) => {
            const fields = question.fields.filter((field) => isAsked(field.showIf, answers))
            const scoredField = fields.find((field) => field.scored)
            return {
              number: question.number,
              title: question.title,
              answers: fields
                .map((field) => ({ label: field.label, text: answerText(field, shownValue(field, answers, report.automatic)) }))
                .filter((answer) => answer.text),
              points:
                scoredField && answers[scoredField.key] !== undefined
                  ? `${fieldPoints(scoredField, answers[scoredField.key])} / ${fieldMaxPoints(scoredField)} points`
                  : undefined,
            }
          }),
      }
    }),
  }
}

export async function downloadEsgReadyPdf(report: EsgReadyReport, answers: Partial<EsgAnswers>) {
  const input = pdfInput(report, answers)
  await downloadPdf(
    async () => createElement((await import('./esg-pdf')).EsgReadyDocument, input),
    `ESG Ready ${report.year} - ${input.companyName || 'self-assessment'}.pdf`,
  )
}
