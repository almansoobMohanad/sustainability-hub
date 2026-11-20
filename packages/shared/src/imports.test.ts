import { describe, expect, test } from 'vitest'
import { columnForHeader, importActions, matchUnit, normalizeLabel, parseAmount, parseMonth, sourceLabel } from './imports'

const now = new Date('2026-06-15T12:00:00Z')
const month = (value: string) => parseMonth(value, now)

describe('parseMonth', () => {
  test('reads the usual ways of writing a month', () => {
    const march = [
      '2025-03',
      '2025-3',
      '2025/03',
      '2025.03',
      '03/2025',
      '3-2025',
      'Mar 2025',
      'March 2025',
      'mar-2025',
      'MARCH, 2025',
      '2025 Mar',
      'Mac 2025', // Malay
      '2025-03-15',
      '2025-03-01T00:00:00',
      '15/03/2025', // day first (Malaysia, UK)
      '03/15/2025', // month first (US)
      '03/03/2025',
    ]
    for (const text of march) expect(month(text), text).toEqual({ ok: true, value: '2025-03' })
    expect(month('Sept 2025')).toEqual({ ok: true, value: '2025-09' })
    expect(month('Ogos 2025')).toEqual({ ok: true, value: '2025-08' })
    expect(month('Dis 2025')).toEqual({ ok: true, value: '2025-12' })
  })

  test('refuses dates that could be two different months instead of guessing', () => {
    const result = month('01/03/2025')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/2025-03 or 2025-01/)
  })

  test('refuses what is not a month, 2-digit years, the future and before 1990', () => {
    for (const bad of ['', '  ', 'March', '2025', '2025-13', '13/2025', 'Mar 25', '03/25', 'Smarch 2025', 'n/a', '1989-12']) {
      expect(month(bad).ok, bad).toBe(false)
    }
    expect(month('2026-07')).toEqual({ ok: false, message: '2026-07 is in the future' })
    expect(month('2026-06').ok).toBe(true)
  })
})

describe('parseAmount', () => {
  test('reads numbers and number text', () => {
    expect(parseAmount(1200.5)).toEqual({ ok: true, value: 1200.5 })
    for (const text of ['1200.5', '1,200.5', ' 1 200.5 ', '1\u00a0200.5']) {
      expect(parseAmount(text), text).toEqual({ ok: true, value: 1200.5 })
    }
    expect(parseAmount('1,234,567')).toEqual({ ok: true, value: 1234567 })
    expect(parseAmount('.5')).toEqual({ ok: true, value: 0.5 })
  })

  test('refuses comma decimals, zero, negatives, text and huge numbers', () => {
    for (const bad of ['1200,5', '1.200,5', '0', '-5', 'abc', '12kg', '1,20', '', null, 0, -1, 1e13, Number.NaN]) {
      expect(parseAmount(bad).ok, String(bad)).toBe(false)
    }
    const comma = parseAmount('1200,5')
    if (!comma.ok) expect(comma.message).toMatch(/dot for decimals/)
  })
})

describe('matchUnit', () => {
  const units = ['litres', 'kWh (Gross CV)', 'kWh (Net CV)', 'tonnes']

  test('matches any case and common spellings', () => {
    expect(matchUnit('Litres', units)).toEqual({ ok: true, value: 'litres' })
    expect(matchUnit('L', units)).toEqual({ ok: true, value: 'litres' })
    expect(matchUnit('liters', units)).toEqual({ ok: true, value: 'litres' })
    expect(matchUnit('kwh (gross cv)', units)).toEqual({ ok: true, value: 'kWh (Gross CV)' })
    expect(matchUnit('t', units)).toEqual({ ok: true, value: 'tonnes' })
  })

  test('refuses units the source does not have, and ambiguous ones', () => {
    const kwh = matchUnit('kWh', units)
    expect(kwh.ok).toBe(false)
    if (!kwh.ok) expect(kwh.message).toContain('litres, kWh (Gross CV), kWh (Net CV) or tonnes')
    expect(matchUnit('ml', ['million litres']).ok).toBe(false)
    expect(matchUnit('kg', units).ok).toBe(false)
  })
})

test('headers are matched however they are written', () => {
  expect(columnForHeader('Month')).toBe('month')
  expect(columnForHeader('Reporting month')).toBe('month')
  expect(columnForHeader('DATA_SOURCE')).toBe('dataSource')
  expect(columnForHeader(' Data source ')).toBe('dataSource')
  expect(columnForHeader('Quantity')).toBe('amount')
  expect(columnForHeader('Problems')).toBe(null)
})

test('source names compare without case, spacing or separator differences', () => {
  const label = sourceLabel({ category: 'Fuels', name: 'Liquid fuels · Diesel (average biofuel blend)' })
  expect(label).toBe('Fuels · Liquid fuels · Diesel (average biofuel blend)')
  expect(normalizeLabel('fuels > liquid fuels >  DIESEL (average biofuel blend)')).toBe(normalizeLabel(label))
  expect(normalizeLabel('Fuels|Liquid fuels|Diesel (average biofuel blend)')).toBe(normalizeLabel(label))
})

describe('importActions', () => {
  const me = 'me'
  const item = { createdById: me, undone: false, verifiedByPerson: 0 }

  test('the importer and verifiers may undo; other members may not', () => {
    expect(importActions('member', me, item).undo).toBe(true)
    expect(importActions('member', 'someone-else', item).undo).toBe(false)
    expect(importActions('manager', 'someone-else', item).undo).toBe(true)
    expect(importActions('admin', 'someone-else', item).undo).toBe(true)
    expect(importActions(null, me, item).undo).toBe(false)
  })

  test('not once an entry was verified by a person, and only once', () => {
    const blocked = importActions('admin', me, { ...item, verifiedByPerson: 3 })
    expect(blocked).toEqual({ undo: false, undoBlocked: '3 entries were verified since the import. Reopen them first to undo it.' })
    expect(importActions('admin', me, { ...item, undone: true })).toEqual({ undo: false, undoBlocked: null })
  })
})
