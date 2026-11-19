import { describe, expect, test } from 'vitest'
import { entryActions, latestReportablePeriod, periodBounds } from './emissions'

describe('periodBounds', () => {
  test('gives the first and last day of the month', () => {
    expect(periodBounds('2026-03')).toEqual({ year: 2026, month: 3, start: '2026-03-01', end: '2026-03-31' })
    expect(periodBounds('2025-04').end).toBe('2025-04-30')
  })

  test('knows leap years', () => {
    expect(periodBounds('2024-02').end).toBe('2024-02-29')
    expect(periodBounds('2025-02').end).toBe('2025-02-28')
    expect(periodBounds('2100-02').end).toBe('2100-02-28')
  })

  test('refuses anything that is not YYYY-MM', () => {
    for (const bad of ['2026-13', '2026-00', '2026-3', '26-03', '2026-03-01', '']) {
      expect(() => periodBounds(bad)).toThrow()
    }
  })
})

describe('latestReportablePeriod', () => {
  test('is the current month', () => {
    expect(latestReportablePeriod(new Date('2026-06-15T12:00:00Z'))).toBe('2026-06')
  })

  test('already allows the new month where the day has started (UTC+14)', () => {
    // 31 Dec 10:00 UTC is already 1 January in the furthest-ahead time zone
    expect(latestReportablePeriod(new Date('2026-12-31T10:00:00Z'))).toBe('2027-01')
    expect(latestReportablePeriod(new Date('2026-12-31T09:59:00Z'))).toBe('2026-12')
  })
})

describe('entryActions', () => {
  const me = 'user-me'
  const other = 'user-other'
  const pending = { status: 'pending', createdById: me } as const
  const pendingOther = { status: 'pending', createdById: other } as const
  const verified = { status: 'verified', createdById: me } as const
  const rejected = { status: 'rejected', createdById: me } as const

  test('Members: only their own entries, until verified; never review', () => {
    expect(entryActions('member', me, pending)).toEqual({ edit: true, delete: true, verify: false, reject: false, reopen: false })
    expect(entryActions('member', me, rejected)).toMatchObject({ edit: true, delete: true })
    expect(entryActions('member', me, pendingOther)).toEqual({ edit: false, delete: false, verify: false, reject: false, reopen: false })
    expect(entryActions('member', me, verified)).toEqual({ edit: false, delete: false, verify: false, reject: false, reopen: false })
  })

  test.each(['manager', 'admin'] as const)('%s: any entry; review Pending ones, their own too', (role) => {
    expect(entryActions(role, me, pending)).toEqual({ edit: true, delete: true, verify: true, reject: true, reopen: false })
    expect(entryActions(role, me, pendingOther)).toEqual({ edit: true, delete: true, verify: true, reject: true, reopen: false })
    expect(entryActions(role, me, rejected)).toEqual({ edit: true, delete: true, verify: false, reject: false, reopen: false })
    // Verified entries are locked: only reopening is possible
    expect(entryActions(role, me, verified)).toEqual({ edit: false, delete: false, verify: false, reject: false, reopen: true })
  })

  test('entries of a removed person (no creator) can only be handled by verifiers', () => {
    const orphan = { status: 'pending', createdById: null } as const
    expect(entryActions('member', me, orphan).edit).toBe(false)
    expect(entryActions('manager', me, orphan).edit).toBe(true)
  })

  test('no role (not a member): nothing', () => {
    expect(entryActions(null, me, pending)).toEqual({ edit: false, delete: false, verify: false, reject: false, reopen: false })
  })
})
