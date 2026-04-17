import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/auth-store'
import { useProhibitionStore } from '../stores/prohibition-store'
import ProhibitionCard from '../components/ProhibitionCard'
import StreakBadge from '../components/StreakBadge'

export default function HomePage() {
  const user = useAuthStore(s => s.user)
  const { prohibitions, loading, fetchToday } = useProhibitionStore()

  useEffect(() => {
    if (!user) return
    fetchToday(user.id)
    const interval = setInterval(() => fetchToday(user.id), 60_000)
    return () => clearInterval(interval)
  }, [user, fetchToday])

  const today = new Date()
  const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일 ${['일', '월', '화', '수', '목', '금', '토'][today.getDay()]}요일`

  const succeededCount = prohibitions.filter(p => p.status === 'succeeded').length

  return (
    <div className="p-5">
      <div className="flex justify-between items-center mb-5">
        <div>
          <div className="text-xs text-gray-400">{dateStr}</div>
          <h1 className="text-2xl font-black font-serif text-primary">오늘의 금기</h1>
        </div>
        <div className="w-9 h-9 rounded-full bg-cream-orange border-[1.5px] border-dashed border-gray-300 flex items-center justify-center text-base">
          {user?.anonymous_emoji ?? '😊'}
        </div>
      </div>

      {succeededCount > 0 && <div className="mb-4"><StreakBadge count={succeededCount} /></div>}

      {loading ? (
        <div className="text-center text-gray-400 py-12">불러오는 중...</div>
      ) : prohibitions.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <div className="text-4xl mb-3">✕</div>
          <div className="text-sm">아직 금기가 없어요</div>
          <div className="text-xs mt-1">오늘 하지 않을 일을 추가해보세요</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {prohibitions.map(p => (
            <ProhibitionCard key={p.id} prohibition={p} />
          ))}
        </div>
      )}

      <Link
        to="/prohibition/new"
        className="block mt-4 py-3.5 bg-primary rounded-full text-center"
      >
        <span className="text-white font-bold text-sm">+ 오늘의 금기 추가 ✏️</span>
      </Link>
    </div>
  )
}
