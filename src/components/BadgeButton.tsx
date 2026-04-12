import type { BadgeType } from '../lib/types'

const config = {
  me_too: { emoji: '🤝', label: '나도 그래', bg: 'bg-cream-dark' },
  tomorrow: { emoji: '💪', label: '내일은 참자', bg: 'bg-success' },
  fighting: { emoji: '🔥', label: '파이팅', bg: 'bg-fail' },
} as const

interface Props {
  type: BadgeType
  count: number
  active: boolean
  onClick: () => void
}

export default function BadgeButton({ type, count, active, onClick }: Props) {
  const { emoji, label, bg } = config[type]
  return (
    <button
      role="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs ${bg} ${active ? 'font-bold ring-1 ring-primary' : ''}`}
    >
      {emoji} {label} <b>{count}</b>
    </button>
  )
}
