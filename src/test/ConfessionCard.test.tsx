import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ConfessionCard from '../components/ConfessionCard'
import type { Confession } from '../lib/types'

const confession: Confession = {
  id: '1', user_id: 'u1', prohibition_id: 'p1',
  content: '쿠팡에서 에어팟 맥스를 질렀습니다',
  category: '💸', created_at: new Date().toISOString(),
  user: { anonymous_name: '참을성 없는 판다 #42', anonymous_emoji: '🐼' },
  badge_counts: { me_too_count: 12, tomorrow_count: 8, fighting_count: 5 },
}

describe('ConfessionCard', () => {
  it('renders confession content', () => {
    render(<ConfessionCard confession={confession} onBadge={async () => {}} />)
    expect(screen.getByText(/에어팟 맥스를 질렀습니다/)).toBeInTheDocument()
  })

  it('renders anonymous name', () => {
    render(<ConfessionCard confession={confession} onBadge={async () => {}} />)
    expect(screen.getByText('참을성 없는 판다 #42')).toBeInTheDocument()
  })

  it('renders badge counts', () => {
    render(<ConfessionCard confession={confession} onBadge={async () => {}} />)
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })
})
