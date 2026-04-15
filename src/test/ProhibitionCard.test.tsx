import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ProhibitionCard from '../components/ProhibitionCard'
import type { Prohibition } from '../lib/types'

const base: Prohibition = {
  id: '1', user_id: 'u1', title: '야식 먹지 않기', emoji: '🍕',
  difficulty: 3, type: 'all_day', start_time: null, end_time: null,
  date: '2026-04-13', status: 'active', is_recurring: false, verify_deadline_hours: 2,
  created_at: '', updated_at: '',
}

function renderCard(overrides: Partial<Prohibition> = {}) {
  return render(
    <MemoryRouter>
      <ProhibitionCard prohibition={{ ...base, ...overrides }} />
    </MemoryRouter>
  )
}

describe('ProhibitionCard', () => {
  it('renders title and emoji', () => {
    renderCard()
    expect(screen.getByText('야식 먹지 않기')).toBeInTheDocument()
    expect(screen.getByText('🍕')).toBeInTheDocument()
  })

  it('shows "진행중" for active status', () => {
    renderCard({ status: 'active' })
    expect(screen.getByText('진행중')).toBeInTheDocument()
  })

  it('shows "성공!" for succeeded status', () => {
    renderCard({ status: 'succeeded' })
    expect(screen.getByText(/성공/)).toBeInTheDocument()
  })

  it('shows difficulty level', () => {
    renderCard({ difficulty: 3 })
    expect(screen.getByText(/Lv\.3/)).toBeInTheDocument()
  })
})
