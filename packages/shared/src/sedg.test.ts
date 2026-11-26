import { describe, expect, test } from 'vitest'
import {
  SEDG_DISCLOSURES,
  SEDG_FIELD_CODES,
  SEDG_FIELDS,
  SEDG_GENERAL_FIELDS,
  disclosuresFor,
  isDisclosureComplete,
  levelIncludes,
  parseSedgValue,
  type SedgField,
} from './sedg'

describe('the SEDG v2 disclosure list', () => {
  test('has the 38 codes of the official v2 template, each once', () => {
    const codes = SEDG_DISCLOSURES.map((disclosure) => disclosure.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes.filter((code) => code.startsWith('E'))).toHaveLength(17)
    expect(codes.filter((code) => code.startsWith('S'))).toHaveLength(11)
    expect(codes.filter((code) => code.startsWith('G'))).toHaveLength(10)
  })

  test('every field key is unique (they are stored in the database)', () => {
    const keys = [...SEDG_GENERAL_FIELDS, ...SEDG_DISCLOSURES.flatMap((disclosure) => disclosure.fields)].map(
      (field) => field.key,
    )
    expect(new Set(keys).size).toBe(keys.length)
    expect(SEDG_FIELDS.size).toBe(keys.length)
  })

  test('levels include the ones below them', () => {
    expect(levelIncludes('basic', 'basic')).toBe(true)
    expect(levelIncludes('basic', 'intermediate')).toBe(false)
    expect(levelIncludes('advanced', 'intermediate')).toBe(true)
    expect(disclosuresFor('basic').every((disclosure) => disclosure.level === 'basic')).toBe(true)
    expect(disclosuresFor('advanced')).toHaveLength(38)
    expect(disclosuresFor('basic').length).toBeLessThan(disclosuresFor('intermediate').length)
  })

  test('quantities have units; only reductions may be negative', () => {
    for (const field of SEDG_FIELDS.values()) {
      if (field.kind === 'quantity') expect(field.unit, field.key).toBeTruthy()
      if (field.signed) expect(['E1.3', 'E1.4', 'E1.6', 'E2.2', 'E3.2'], field.key).toContain(SEDG_FIELD_CODES.get(field.key))
    }
  })
})

describe('parseSedgValue', () => {
  const field = (kind: SedgField['kind'], extra: Partial<SedgField> = {}): SedgField => ({
    key: 'x',
    label: 'X',
    kind,
    ...extra,
  })

  test('quantities: numbers (also typed as text), not negative unless signed', () => {
    expect(parseSedgValue(field('quantity'), '12.5')).toEqual({ value: 12.5 })
    expect(parseSedgValue(field('quantity'), 0)).toEqual({ value: 0 })
    expect(parseSedgValue(field('quantity'), -1)).toHaveProperty('error')
    expect(parseSedgValue(field('quantity', { signed: true }), -1)).toEqual({ value: -1 })
    expect(parseSedgValue(field('quantity'), 'abc')).toHaveProperty('error')
    expect(parseSedgValue(field('quantity'), '1,000')).toHaveProperty('error')
    expect(parseSedgValue(field('quantity'), 1e16)).toHaveProperty('error')
  })

  test('percent, count and year ranges', () => {
    expect(parseSedgValue(field('percent'), 100)).toEqual({ value: 100 })
    expect(parseSedgValue(field('percent'), 101)).toHaveProperty('error')
    expect(parseSedgValue(field('count'), 3)).toEqual({ value: 3 })
    expect(parseSedgValue(field('count'), 2.5)).toHaveProperty('error')
    expect(parseSedgValue(field('year'), 2025)).toEqual({ value: 2025 })
    expect(parseSedgValue(field('year'), 25)).toHaveProperty('error')
  })

  test('text is trimmed (one line collapses spaces, lists keep line breaks) and limited', () => {
    expect(parseSedgValue(field('text'), '  Shah   Alam ')).toEqual({ value: 'Shah Alam' })
    expect(parseSedgValue(field('list'), ' Steel\nPlastic \n')).toEqual({ value: 'Steel\nPlastic' })
    expect(parseSedgValue(field('text'), '   ')).toHaveProperty('error')
    expect(parseSedgValue(field('text'), 'x'.repeat(301))).toHaveProperty('error')
    expect(parseSedgValue(field('text'), 5)).toHaveProperty('error')
  })
})

test('a disclosure is complete when every required field has a value', () => {
  const disclosure = SEDG_DISCLOSURES.find((item) => item.code === 'S1.1')!
  const filled = new Set(['s1_1_child', 's1_1_forced'])
  expect(isDisclosureComplete(disclosure, (field) => filled.has(field.key))).toBe(true)
  filled.delete('s1_1_forced')
  expect(isDisclosureComplete(disclosure, (field) => filled.has(field.key))).toBe(false)
})
