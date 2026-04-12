import type { Prohibition } from '../lib/types'

interface Props {
  history: Prohibition[]
}

const dayNames = ['일', '월', '화', '수', '목', '금', '토']

const statusStyle = {
  succeeded: 'bg-success text-success-text',
  failed: 'bg-fail text-accent',
  unverified: 'bg-gray-100 text-gray-400',
  active: 'bg-cream-dark border-2 border-dashed border-gray-300',
} as const

const statusIcon = {
  succeeded: '✓',
  failed: '✕',
  unverified: '?',
  active: '⏳',
} as const

export default function WeekHistory({ history }: Props) {
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (6 - i))
    return d
  })

  return (
    <div className="p-4 bg-white rounded-2xl border-[1.5px] border-gray-100">
      <div className="text-sm font-bold text-primary mb-2.5">최근 7일</div>
      <div className="flex justify-between gap-1">
        {days.map(d => {
          const dateStr = d.toISOString().split('T')[0]
          const isToday = dateStr === today.toISOString().split('T')[0]
          const record = history.find(h => h.date === dateStr)
          const status = record?.status ?? 'unverified'

          return (
            <div key={dateStr} className="flex-1 text-center">
              <div className={`text-[10px] ${isToday ? 'text-primary font-bold' : 'text-gray-300'}`}>
                {isToday ? '오늘' : dayNames[d.getDay()]}
              </div>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs mx-auto mt-1 ${statusStyle[status]}`}>
                {statusIcon[status]}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
