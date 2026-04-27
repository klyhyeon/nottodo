import { describe, it, expect, vi, afterEach } from 'vitest'
import { getLocalToday, getLocalYesterday, formatLocalDate } from '../lib/date-utils'

describe('formatLocalDate', () => {
  it('formats date as YYYY-MM-DD', () => {
    const d = new Date(2026, 3, 27) // April 27
    expect(formatLocalDate(d)).toBe('2026-04-27')
  })

  it('zero-pads single-digit month and day', () => {
    const d = new Date(2026, 0, 5) // Jan 5
    expect(formatLocalDate(d)).toBe('2026-01-05')
  })
})

describe('getLocalToday', () => {
  afterEach(() => vi.useRealTimers())

  it('returns today in YYYY-MM-DD local time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 27, 23, 59))
    expect(getLocalToday()).toBe('2026-04-27')
  })
})

describe('getLocalYesterday', () => {
  afterEach(() => vi.useRealTimers())

  it('returns yesterday in YYYY-MM-DD local time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 27, 0, 30))
    expect(getLocalYesterday()).toBe('2026-04-26')
  })

  it('handles month boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 1, 10, 0)) // May 1
    expect(getLocalYesterday()).toBe('2026-04-30')
  })
})
