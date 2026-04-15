import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth-store'
import { useProhibitionStore, calculateStreak, getVerifyDeadline } from '../stores/prohibition-store'
import WeekHistory from '../components/WeekHistory'
import CountdownTimer from '../components/CountdownTimer'
import type { Prohibition } from '../lib/types'

export default function ProhibitionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const { prohibitions, updateStatus, fetchHistory } = useProhibitionStore()
  const prohibition = prohibitions.find(p => p.id === id)

  const [history, setHistory] = useState<Prohibition[]>([])
  const [maxStreak, setMaxStreak] = useState(0)

  useEffect(() => {
    if (user && prohibition) {
      fetchHistory(user.id, prohibition.title).then(data => {
        setHistory(data)
        let max = 0
        let current = 0
        for (const p of [...data].sort((a, b) => a.date.localeCompare(b.date))) {
          if (p.status === 'succeeded') { current++; max = Math.max(max, current) }
          else { current = 0 }
        }
        setMaxStreak(max)
      })
    }
  }, [user, prohibition, fetchHistory])

  if (!prohibition) {
    return <div className="p-5 text-center text-gray-400">금기를 찾을 수 없어요</div>
  }

  const streak = calculateStreak(history)

  const handleSuccess = async () => {
    await updateStatus(prohibition.id, 'succeeded')
    navigate('/')
  }

  const handleFail = async () => {
    await updateStatus(prohibition.id, 'failed')
    navigate(`/prohibition/${prohibition.id}/failed`)
  }

  const handleDelete = async () => {
    if (!window.confirm('이 금기를 삭제할까요?')) return
    await useProhibitionStore.getState().deleteProhibition(prohibition.id)
    navigate('/')
  }

  const [timerDone, setTimerDone] = useState(false)

  const handleTimerComplete = () => {
    setTimerDone(true)
  }

  return (
    <div className="p-5">
      <div className="flex justify-between items-center mb-5">
        <button onClick={() => navigate(-1)} className="text-lg">← 뒤로</button>
        {prohibition.status === 'active' ? (
          <button onClick={() => navigate(`/prohibition/new?edit=${prohibition.id}`)} className="text-sm text-gray-400">수정</button>
        ) : (
          <button onClick={handleDelete} className="text-sm text-accent">삭제</button>
        )}
      </div>

      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-[72px] h-[72px] rounded-full bg-cream border-[2.5px] border-dashed border-gray-300 flex items-center justify-center text-3xl font-black text-primary mx-auto mb-3">
          {prohibition.status === 'failed' ? '😵' : '✕'}
        </div>
        <h1 className="text-xl font-black font-serif text-primary">{prohibition.title}</h1>
        <div className="text-sm text-gray-400 mt-1">
          {prohibition.emoji} Lv.{prohibition.difficulty} · {prohibition.type === 'timed' ? '시간 지정' : '하루종일'}
        </div>
      </div>

      {/* Timer (timed type) */}
      {prohibition.type === 'timed' && prohibition.status === 'active' && prohibition.end_time && (
        <div className={`p-6 bg-white rounded-2xl border-[1.5px] ${timerDone ? 'border-gray-200' : 'border-success'} text-center mb-3`}>
          {timerDone ? (
            <>
              <div className="text-xs text-gray-400 font-semibold mb-2">⏰ 금기 시간 종료</div>
              <div className="text-sm text-gray-500 leading-relaxed">시간이 끝났어요!<br />성공했다면 아래 버튼을 눌러주세요.</div>
            </>
          ) : (
            <>
              <div className="text-xs text-success-text font-semibold mb-2">🟢 금기 시간 진행중</div>
              <CountdownTimer endTime={prohibition.end_time} onComplete={handleTimerComplete} />
              <div className="text-xs text-gray-400 mt-2">
                {prohibition.start_time?.slice(0, 5)} ~ {prohibition.end_time?.slice(0, 5)}
              </div>
            </>
          )}
        </div>
      )}

      {/* Streak */}
      <div className="p-4 bg-cream-dark rounded-2xl text-center mb-3">
        <div className="text-xs text-gray-400 mb-1">연속 성공</div>
        <div className="text-3xl font-black text-primary">🔥 {streak}일</div>
        <div className="text-xs text-gray-400 mt-1">최고 기록: {maxStreak}일</div>
      </div>

      {/* Week History */}
      <div className="mb-4">
        <WeekHistory history={history} />
      </div>

      {/* Actions */}
      {prohibition.status === 'active' && (
        <div className="flex gap-2.5">
          <button onClick={handleSuccess} className="flex-1 py-3.5 bg-primary rounded-full text-white font-bold text-sm">
            오늘 성공! ✨
          </button>
          <button onClick={handleFail} className="flex-1 py-3.5 bg-white border-[1.5px] border-fail-border rounded-full text-accent font-bold text-sm">
            실패했어... 😵
          </button>
        </div>
      )}

      {prohibition.status === 'active' && (
        <div className="text-center mt-2 text-xs text-gray-300">
          {(() => {
            const deadline = getVerifyDeadline(prohibition)
            const h = deadline.getHours()
            const m = deadline.getMinutes()
            const dateStr = deadline.getDate() !== new Date().getDate() ? '내일 ' : ''
            return `인증 마감: ${dateStr}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}까지`
          })()}
        </div>
      )}

    </div>
  )
}
