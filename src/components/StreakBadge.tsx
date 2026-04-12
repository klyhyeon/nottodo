interface StreakBadgeProps {
  count: number
}

export default function StreakBadge({ count }: StreakBadgeProps) {
  if (count === 0) return null
  return (
    <div className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-cream-dark rounded-full text-sm">
      <span>🔥</span>
      <span className="font-bold text-primary">{count}일 연속</span>
      <span className="text-gray-400">참는 중</span>
    </div>
  )
}
