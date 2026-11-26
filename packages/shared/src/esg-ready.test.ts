import { describe, expect, test } from 'vitest'
import {
  ESG_FIELDS,
  ESG_QUESTIONS,
  askedQuestions,
  esgBand,
  esgScore,
  isQuestionAnswered,
  parseEsgValue,
  type EsgAnswers,
} from './esg-ready'

describe('the ESG Ready questionnaire', () => {
  test('has the 42 questions in five sections', () => {
    expect(ESG_QUESTIONS.map((question) => question.number)).toEqual(Array.from({ length: 42 }, (_, index) => index + 1))
    const count = (section: string) => ESG_QUESTIONS.filter((question) => question.section === section).length
    expect([count('A'), count('B'), count('C'), count('D'), count('E')]).toEqual([7, 9, 9, 9, 8])
  })

  test('field keys and option ids are unique (they are stored)', () => {
    const keys = ESG_QUESTIONS.flatMap((question) => question.fields.map((field) => field.key))
    expect(new Set(keys).size).toBe(keys.length)
    expect(ESG_FIELDS.size).toBe(keys.length)
    for (const field of ESG_FIELDS.values()) {
      const ids = (field.options ?? []).map((option) => option.id)
      expect(new Set(ids).size, field.key).toBe(ids.length)
    }
  })

  test('every scored single answer has four steps; section A is never scored', () => {
    for (const question of ESG_QUESTIONS) {
      for (const field of question.fields) {
        if (question.section === 'A') expect(field.scored, field.key).toBeFalsy()
        if (field.scored && field.kind === 'choice') expect(field.options, field.key).toHaveLength(4)
      }
    }
  })
})

describe('scoring', () => {
  const scoredChoices = [...ESG_FIELDS.values()].filter((field) => field.scored && field.kind === 'choice')

  test('108 points in total: 34 questions x 3 + 6 for stakeholders', () => {
    const empty = esgScore({})
    expect(scoredChoices).toHaveLength(34)
    expect(empty).toMatchObject({ points: 0, max: 108, percent: 0, band: { label: 'Getting started' } })
    expect(empty.sections).toEqual({
      B: { points: 0, max: 30 },
      C: { points: 0, max: 27 },
      D: { points: 0, max: 27 },
      E: { points: 0, max: 24 },
    })
  })

  test('the strongest answer everywhere is 100%; each answer earns its place in the list', () => {
    const best: EsgAnswers = Object.fromEntries(scoredChoices.map((field) => [field.key, field.options!.at(-1)!.id]))
    best.q9_stakeholders = ['customers', 'employees', 'board_of_directors', 'investors', 'financiers', 'community']
    expect(esgScore(best)).toMatchObject({ points: 108, percent: 100, band: { label: 'Excellent' } })

    const second: EsgAnswers = { q8_maturity: 'b', q17_carbon: 'c', q9_stakeholders: ['customers', 'employees'] }
    expect(esgScore(second)).toMatchObject({ points: 1 + 2 + 2 })
    expect(esgScore({ q9_stakeholders: ['none'] }).points).toBe(0)
  })

  test('bands: 80 / 60 / 40', () => {
    expect([esgBand(80).label, esgBand(79.9).label, esgBand(60).label, esgBand(40).label, esgBand(39.9).label]).toEqual([
      'Excellent',
      'Good progress',
      'Good progress',
      'Developing',
      'Getting started',
    ])
  })
})

describe('answers', () => {
  const field = (key: string) => ESG_FIELDS.get(key)!

  test('choices and selects must be one of the answers given', () => {
    expect(parseEsgValue(field('q8_maturity'), 'c')).toEqual({ value: 'c' })
    expect(parseEsgValue(field('q8_maturity'), 'z')).toHaveProperty('error')
    expect(parseEsgValue(field('location'), 'selangor')).toEqual({ value: 'selangor' })
    expect(parseEsgValue(field('location'), ['selangor'])).toHaveProperty('error')
  })

  test('several answers: known ones, stored in list order, "None of the above" alone', () => {
    expect(parseEsgValue(field('q9_stakeholders'), ['community', 'customers', 'customers'])).toEqual({
      value: ['customers', 'community'],
    })
    expect(parseEsgValue(field('q9_stakeholders'), ['none', 'customers'])).toHaveProperty('error')
    expect(parseEsgValue(field('q9_stakeholders'), [])).toHaveProperty('error')
    expect(parseEsgValue(field('q9_stakeholders'), ['martians'])).toHaveProperty('error')
  })

  test('text is trimmed and limited', () => {
    expect(parseEsgValue(field('phone'), '  +60 12  345 6789 ')).toEqual({ value: '+60 12 345 6789' })
    expect(parseEsgValue(field('phone'), '   ')).toHaveProperty('error')
    expect(parseEsgValue(field('phone'), 'x'.repeat(301))).toHaveProperty('error')
  })

  test('Q7 and the "Other" fields are only asked when they apply', () => {
    expect(askedQuestions({}).some((question) => question.number === 7)).toBe(false)
    expect(askedQuestions({ reporting_standard: ['none'] }).some((question) => question.number === 7)).toBe(true)

    const q3 = ESG_QUESTIONS.find((question) => question.number === 3)!
    const has = (answers: EsgAnswers) => (key: { key: string }) => answers[key.key] !== undefined
    const chosen: EsgAnswers = { subsector: 'fb' }
    expect(isQuestionAnswered(q3, has(chosen), chosen)).toBe(true)
    const other: EsgAnswers = { subsector: 'other' }
    expect(isQuestionAnswered(q3, has(other), other)).toBe(false) // "please specify"
  })
})
