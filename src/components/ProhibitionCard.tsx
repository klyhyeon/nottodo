import { Link } from 'react-router-dom'
import type { Prohibition } from '../lib/types'

const statusConfig = {
  active: { label: '진행중', bg: 'bg-gray-100', text: 'text-gray-400' },
  succeeded: { label: '성공! ✨', bg: 'bg-success', text: 'text-success-text' },
  failed: { label: '실패', bg: 'bg-fail', text: 'text-accent' },
  unverified: { label: '미인증', bg: 'bg-gray-100', text: 'text-gray-400' },
} as const

interface Props {
  prohibition: Prohibition
}

export default function ProhibitionCard({ prohibition }: Props) {
  const { id, title, emoji, difficulty, type, start_time, end_time, status } = prohibition
  const config = statusConfig[status]

  const timeLabel = type === 'timed' && start_time && end_time
    ? `${start_time.slice(0, 5)}~${end_time.slice(0, 5)}`
    : '하루종일'

  return (
    <Link
      to={status === 'failed' ? `/prohibition/${id}/failed` : `/prohibition/${id}`}
      className={`flex items-center p-4 bg-white rounded-2xl gap-3 border-[1.5px] ${
        status === 'succeeded' ? 'border-success' : status === 'failed' ? 'border-fail-border' : 'border-gray-100'
      }`}
    >
      <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg font-black ${
        status === 'succeeded' ? 'bg-success text-success-text line-through' : 'bg-cream border-2 border-dashed border-gray-300 text-primary'
      }`}>
        {status === 'failed' ? '😵' : '✕'}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-bold text-sm ${status === 'succeeded' ? 'text-gray-400 line-through' : status === 'failed' ? 'text-accent' : 'text-primary'}`}>
          {title}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          Lv.{difficulty} · {timeLabel} · <span>{emoji}</span>
        </div>
      </div>
      <div className={`text-xs px-2.5 py-1 rounded-full font-semibold ${config.bg} ${config.text}`}>
        {config.label}
      </div>
    </Link>
  )
}
