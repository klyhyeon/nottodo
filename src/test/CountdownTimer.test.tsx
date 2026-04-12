import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import CountdownTimer from '../components/CountdownTimer'

describe('CountdownTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders time remaining in HH:MM:SS format', () => {
    vi.setSystemTime(new Date('2026-04-13T23:00:00'))
    render(<CountdownTimer endTime="01:00" onComplete={vi.fn()} />)
    expect(screen.getByText(/02:00:00/)).toBeInTheDocument()
  })

  it('shows 00:00:00 when time has passed', () => {
    vi.setSystemTime(new Date('2026-04-14T02:00:00'))
    render(<CountdownTimer endTime="01:00" onComplete={vi.fn()} />)
    expect(screen.getByText('00:00:00')).toBeInTheDocument()
  })
})
