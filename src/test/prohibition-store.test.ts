import { describe, it, expect } from 'vitest'
import {
  isValidTransition,
  calculateStreak,
  mergeTemplatesAndInstances,
} from '../stores/prohibition-store'
import type { Prohibition, ProhibitionTemplate } from '../lib/types'

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
    id: '1', user_id: '1', template_id: null, title: 'test', emoji: '🍕', difficulty: 1,
    type: 'all_day', start_time: null, end_time: null,
    date, status, is_recurring: false, recurring_group_id: null, verify_deadline_hours: 2,
    created_at: '', updated_at: '', deleted_at: null,
  })

  it('returns 0 for empty list', () => {
    expect(calculateStreak([])).toBe(0)
  })
  it('counts consecutive succeeded days backwards', () => {
    expect(calculateStreak([
      makeProhibition('2026-04-13', 'succeeded'),
      makeProhibition('2026-04-12', 'succeeded'),
      makeProhibition('2026-04-11', 'succeeded'),
    ])).toBe(3)
  })
  it('stops at first non-succeeded day', () => {
    expect(calculateStreak([
      makeProhibition('2026-04-13', 'succeeded'),
      makeProhibition('2026-04-12', 'failed'),
      makeProhibition('2026-04-11', 'succeeded'),
    ])).toBe(1)
  })
  it('returns 0 if most recent is not succeeded', () => {
    expect(calculateStreak([
      makeProhibition('2026-04-13', 'failed'),
      makeProhibition('2026-04-12', 'succeeded'),
    ])).toBe(0)
  })
})

describe('mergeTemplatesAndInstances', () => {
  const today = '2026-04-27'

  const makeTemplate = (overrides: Partial<ProhibitionTemplate> = {}): ProhibitionTemplate => ({
    id: 'tmpl-1',
    user_id: 'u1',
    title: '늦게 자지 않기',
    emoji: '💤',
    difficulty: 3,
    type: 'all_day',
    start_time: null,
    end_time: null,
    verify_deadline_hours: 2,
    active: true,
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
    ...overrides,
  })

  const makeInstance = (overrides: Partial<Prohibition> = {}): Prohibition => ({
    id: 'inst-1',
    user_id: 'u1',
    template_id: 'tmpl-1',
    title: '늦게 자지 않기',
    emoji: '💤',
    difficulty: 3,
    type: 'all_day',
    start_time: null,
    end_time: null,
    date: today,
    status: 'succeeded',
    is_recurring: true,
    recurring_group_id: 'tmpl-1',
    verify_deadline_hours: 2,
    created_at: '2026-04-27T10:00:00Z',
    updated_at: '2026-04-27T10:00:00Z',
    deleted_at: null,
    ...overrides,
  })

  it('shows template as active when no today-instance exists', () => {
    const result = mergeTemplatesAndInstances([makeTemplate()], [], [], today)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('active')
    expect(result[0].templateId).toBe('tmpl-1')
    expect(result[0].is_recurring).toBe(true)
  })

  it('shows instance status when today-instance exists', () => {
    const result = mergeTemplatesAndInstances(
      [makeTemplate()],
      [makeInstance({ status: 'succeeded' })],
      [],
      today,
    )
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('succeeded')
    expect(result[0].id).toBe('inst-1')
  })

  it('shows failed instance status', () => {
    const result = mergeTemplatesAndInstances(
      [makeTemplate()],
      [makeInstance({ status: 'failed' })],
      [],
      today,
    )
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('failed')
  })

  it('includes one-off prohibitions alongside templates', () => {
    const oneOff: Prohibition = makeInstance({
      id: 'oneoff-1', template_id: null, title: '커피 안 마시기',
      is_recurring: false, recurring_group_id: null,
    })
    const result = mergeTemplatesAndInstances([makeTemplate()], [], [oneOff], today)
    expect(result).toHaveLength(2)
    expect(result.find(r => r.title === '커피 안 마시기')).toBeTruthy()
    expect(result.find(r => r.title === '늦게 자지 않기')?.status).toBe('active')
  })

  it('never shows duplicate for same template', () => {
    const result = mergeTemplatesAndInstances(
      [makeTemplate(), makeTemplate({ id: 'tmpl-2', title: '야식 안 먹기' })],
      [makeInstance()],
      [],
      today,
    )
    expect(result).toHaveLength(2)
  })
})
