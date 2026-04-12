import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BadgeButton from '../components/BadgeButton'

describe('BadgeButton', () => {
  it('renders count and label', () => {
    render(<BadgeButton type="me_too" count={5} active={false} onClick={vi.fn()} />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText(/나도 그래/)).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<BadgeButton type="fighting" count={3} active={false} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('shows active state', () => {
    const { container } = render(<BadgeButton type="me_too" count={5} active={true} onClick={vi.fn()} />)
    expect(container.firstChild).toHaveClass('font-bold')
  })
})
