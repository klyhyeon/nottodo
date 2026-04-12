import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth-store'
import { useProhibitionStore } from '../stores/prohibition-store'
import { supabase } from '../lib/supabase'
import type { Prohibition } from '../lib/types'

export default function FailedPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const { prohibitions, fetchHistory } = useProhibitionStore()
  const prohibition = prohibitions.find(p => p.id === id)

  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)
  const [stats, setStats] = useState({ total: 0, succeeded: 0, failed: 0 })

  useEffect(() => {
    if (user && prohibition) {
      fetchHistory(user.id, prohibition.title).then(data => {
        setStats({
          total: data.length,
          succeeded: data.filter(p => p.status === 'succeeded').length,
          failed: data.filter(p => p.status === 'failed').length,
        })
      })
    }
  }, [user, prohibition, fetchHistory])

  if (!prohibition) {
    return <div className="p-5 text-center text-gray-400">금기를 찾을 수 없어요</div>
  }

  const successRate = stats.total > 0 ? Math.round((stats.succeeded / stats.total) * 100) : 0

  const handleConfess = async () => {
    if (!user || !content.trim() || posting) return
    setPosting(true)
    const { error } = await supabase.from('confessions').insert({
      user_id: user.id,
      prohibition_id: prohibition.id,
      content: content.trim(),
      category: prohibition.emoji,
    })
    if (!error) navigate('/')
    else setPosting(false)
  }

  return (
    <div className="p-5">
      <div className="flex items-center mb-5">
        <button onClick={() => navigate('/')} className="text-lg">← 뒤로</button>
      </div>

      {/* Fail Header */}
      <div className="text-center mb-6">
        <div className="w-[72px] h-[72px] rounded-full bg-cream-orange flex items-center justify-center text-4xl mx-auto mb-3">😵</div>
        <h1 className="text-xl font-black font-serif text-accent">{prohibition.title}</h1>
        <div className="inline-block mt-2 px-3 py-1 bg-fail rounded-xl text-xs text-accent font-semibold">실패</div>
      </div>

      {/* Confession prompt */}
      <div className="p-5 bg-white rounded-2xl border-[1.5px] border-fail-border mb-3">
        <div className="text-sm font-bold text-primary mb-3">무슨 일이 있었나요? ✏️</div>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="솔직하게 적어보세요. 익명이니까 괜찮아요!"
          className="w-full p-3.5 bg-gray-50 border-[1.5px] border-dashed border-gray-200 rounded-xl text-sm text-primary placeholder-gray-300 outline-none resize-none leading-relaxed"
        />
        <div className="flex items-center gap-2 mt-3">
          <div className="w-5 h-5 rounded-full bg-cream-orange flex items-center justify-center text-[10px]">
            {user?.anonymous_emoji}
          </div>
          <span className="text-xs text-gray-400">{user?.anonymous_name}로 익명 게시</span>
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 bg-white rounded-2xl border-[1.5px] border-gray-100 mb-4">
        <div className="text-sm font-bold text-primary mb-2.5">이 금기 통계</div>
        <div className="flex justify-around text-center">
          <div><div className="text-xl font-black text-primary">{stats.total}</div><div className="text-[11px] text-gray-400">도전</div></div>
          <div className="w-px bg-gray-100" />
          <div><div className="text-xl font-black text-success-text">{stats.succeeded}</div><div className="text-[11px] text-gray-400">성공</div></div>
          <div className="w-px bg-gray-100" />
          <div><div className="text-xl font-black text-accent">{stats.failed}</div><div className="text-[11px] text-gray-400">실패</div></div>
          <div className="w-px bg-gray-100" />
          <div><div className="text-xl font-black text-primary">{successRate}%</div><div className="text-[11px] text-gray-400">성공률</div></div>
        </div>
      </div>

      {/* CTAs */}
      <button
        onClick={handleConfess}
        disabled={!content.trim() || posting}
        className="w-full py-3.5 bg-primary text-white rounded-full font-bold text-sm disabled:opacity-40 mb-2"
      >
        {posting ? '게시 중...' : '실패의 방에 고백하기 💬'}
      </button>
      <button
        onClick={() => navigate('/')}
        className="w-full py-3.5 bg-white border-[1.5px] border-gray-200 rounded-full text-gray-400 font-semibold text-sm"
      >
        조용히 넘어가기
      </button>
    </div>
  )
}
