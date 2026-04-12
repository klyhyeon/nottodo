import type { Confession, BadgeType } from '../lib/types'
import BadgeButton from './BadgeButton'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

interface Props {
  confession: Confession
  activeBadges?: BadgeType[]
  onBadge: (confessionId: string, type: BadgeType) => Promise<void>
}

export default function ConfessionCard({ confession, activeBadges = [], onBadge }: Props) {
  const { id, content, category, created_at, user, badge_counts } = confession
  const counts = badge_counts ?? { me_too_count: 0, tomorrow_count: 0, fighting_count: 0 }

  return (
    <div className="p-4 bg-white rounded-2xl border-[1.5px] border-gray-100">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-full bg-cream-orange flex items-center justify-center text-xs">
            {user?.anonymous_emoji ?? '🐼'}
          </div>
          <span className="text-[13px] font-bold text-primary">{user?.anonymous_name ?? '익명'}</span>
        </div>
        <span className="text-[10px] text-gray-300">{timeAgo(created_at)}</span>
      </div>
      <div className="inline-block px-2.5 py-0.5 bg-cream-dark rounded-xl text-[11px] text-accent mb-2">
        {category}
      </div>
      <p className="text-sm text-gray-700 leading-relaxed mb-3">{content}</p>
      <div className="flex gap-1.5">
        <BadgeButton type="me_too" count={counts.me_too_count} active={activeBadges.includes('me_too')} onClick={() => onBadge(id, 'me_too')} />
        <BadgeButton type="tomorrow" count={counts.tomorrow_count} active={activeBadges.includes('tomorrow')} onClick={() => onBadge(id, 'tomorrow')} />
        <BadgeButton type="fighting" count={counts.fighting_count} active={activeBadges.includes('fighting')} onClick={() => onBadge(id, 'fighting')} />
      </div>
    </div>
  )
}
