import { describe, it, expect } from 'vitest'
import { isValidTransition, calculateStreak } from '../stores/prohibition-store'
import type { Prohibition } from '../lib/types'

describe('isValidTransition', () => {
  it('allows active → succeeded', () => {
    expect(isValidTransition('active', 'succeeded')).toBe(true)
  })

  it('allows active → failed', () => {
    expect(isValidTransition('active', 'failed')).toBe(true)
  })

  it('rejects succeeded → failed', () => {
    expect(isValidTransition('succeeded', 'failed')).toBe(false)
  })

  it('rejects failed → succeeded', () => {
    expect(isValidTransition('failed', 'succeeded')).toBe(false)
  })

  it('rejects unverified → anything', () => {
    expect(isValidTransition('unverified', 'succeeded')).toBe(false)
    expect(isValidTransition('unverified', 'failed')).toBe(false)
  })
})

describe('calculateStreak', () => {
  const makeProhibition = (date: string, status: Prohibition['status']): Prohibition => ({
    id: '1', user_id: '1', title: 'test', emoji: '🍕', difficulty: 1,
    type: 'all_day', start_time: null, end_time: null,
    date, status, is_recurring: false, verify_deadline_hours: 2,
    created_at: '', updated_at: '',
  })

  it('returns 0 for empty list', () => {
    expect(calculateStreak([])).toBe(0)
  })

  it('counts consecutive succeeded days backwards from most recent', () => {
    const prohibitions = [
      makeProhibition('2026-04-13', 'succeeded'),
      makeProhibition('2026-04-12', 'succeeded'),
      makeProhibition('2026-04-11', 'succeeded'),
    ]
    expect(calculateStreak(prohibitions)).toBe(3)
  })

  it('stops at first non-succeeded day', () => {
    const prohibitions = [
      makeProhibition('2026-04-13', 'succeeded'),
      makeProhibition('2026-04-12', 'failed'),
      makeProhibition('2026-04-11', 'succeeded'),
    ]
    expect(calculateStreak(prohibitions)).toBe(1)
  })

  it('treats unverified as streak-breaking', () => {
    const prohibitions = [
      makeProhibition('2026-04-13', 'succeeded'),
      makeProhibition('2026-04-12', 'unverified'),
      makeProhibition('2026-04-11', 'succeeded'),
    ]
    expect(calculateStreak(prohibitions)).toBe(1)
  })

  it('returns 0 if most recent is not succeeded', () => {
    const prohibitions = [
      makeProhibition('2026-04-13', 'failed'),
      makeProhibition('2026-04-12', 'succeeded'),
    ]
    expect(calculateStreak(prohibitions)).toBe(0)
  })
})
