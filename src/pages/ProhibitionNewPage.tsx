import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/auth-store'
import { useProhibitionStore } from '../stores/prohibition-store'
import { supabase } from '../lib/supabase'
import type { ProhibitionType } from '../lib/types'

const EMOJI_OPTIONS = ['🍕', '📱', '💸', '🍺', '🛒', '🎮', '☕', '🚬', '💤', '🚫']

export default function ProhibitionNewPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit')
  const user = useAuthStore(s => s.user)
  const { create, prohibitions, deleteProhibition } = useProhibitionStore()
  const editTarget = editId ? prohibitions.find(p => p.id === editId) : null

  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('🚫')
  const [difficulty, setDifficulty] = useState(1)
  const [type, setType] = useState<ProhibitionType>('all_day')
  const [startTime, setStartTime] = useState('22:00')
  const [endTime, setEndTime] = useState('08:00')
  const [isRecurring, setIsRecurring] = useState(false)
  const [verifyDeadlineHours, setVerifyDeadlineHours] = useState(2)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editTarget) {
      setTitle(editTarget.title)
      setEmoji(editTarget.emoji)
      setDifficulty(editTarget.difficulty)
      setType(editTarget.type)
      if (editTarget.start_time) setStartTime(editTarget.start_time.slice(0, 5))
      if (editTarget.end_time) setEndTime(editTarget.end_time.slice(0, 5))
      setIsRecurring(editTarget.is_recurring)
      setVerifyDeadlineHours(editTarget.verify_deadline_hours ?? 2)
    }
  }, [editTarget])

  const handleSubmit = async () => {
    if (!user || !title.trim() || saving) return
    setSaving(true)
    try {
      if (editTarget) {
        const updates = {
          title: title.trim(),
          emoji,
          difficulty,
          type,
          start_time: type === 'timed' ? startTime : null,
          end_time: type === 'timed' ? endTime : null,
          is_recurring: isRecurring,
          verify_deadline_hours: verifyDeadlineHours,
          updated_at: new Date().toISOString(),
        }
        const { error } = await supabase
          .from('prohibitions')
          .update(updates)
          .eq('id', editTarget.id)
        if (error) throw error
        useProhibitionStore.setState(s => ({
          prohibitions: s.prohibitions.map(p =>
            p.id === editTarget.id ? { ...p, ...updates } : p
          ),
        }))
      } else {
        await create(user.id, {
          title: title.trim(),
          emoji,
          difficulty,
          type,
          start_time: type === 'timed' ? startTime : undefined,
          end_time: type === 'timed' ? endTime : undefined,
          is_recurring: isRecurring,
          verify_deadline_hours: verifyDeadlineHours,
        })
      }
      navigate('/')
    } catch {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editTarget) return
    if (!window.confirm('이 금기를 삭제할까요?')) return
    await deleteProhibition(editTarget.id)
    navigate('/')
  }

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate(-1)} className="text-lg">← 뒤로</button>
        <h1 className="text-lg font-black font-serif text-primary">{editTarget ? '금기 수정' : '금기 추가'}</h1>
        <div className="w-10" />
      </div>

      {/* Title */}
      <label className="block mb-4">
        <span className="text-sm font-bold text-primary mb-1.5 block">오늘 하지 않을 일</span>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="예: 야식 먹지 않기"
          maxLength={30}
          className="w-full px-4 py-3 bg-white border-[1.5px] border-dashed border-gray-300 rounded-2xl text-sm text-primary placeholder-gray-300 outline-none focus:border-primary"
        />
      </label>

      {/* Emoji */}
      <div className="mb-4">
        <span className="text-sm font-bold text-primary mb-1.5 block">카테고리</span>
        <div className="flex flex-wrap gap-2">
          {EMOJI_OPTIONS.map(e => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={`w-10 h-10 rounded-full text-lg flex items-center justify-center border-[1.5px] ${
                emoji === e ? 'border-primary bg-cream-dark' : 'border-gray-200 bg-white'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Difficulty */}
      <div className="mb-4">
        <span className="text-sm font-bold text-primary mb-1.5 block">난이도 Lv.{difficulty}</span>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(lv => (
            <button
              key={lv}
              onClick={() => setDifficulty(lv)}
              className={`flex-1 py-2 rounded-full text-sm font-semibold ${
                difficulty === lv ? 'bg-primary text-white' : 'bg-white border-[1.5px] border-gray-200 text-gray-400'
              }`}
            >
              {lv}
            </button>
          ))}
        </div>
      </div>

      {/* Type */}
      <div className="mb-4">
        <span className="text-sm font-bold text-primary mb-1.5 block">타입</span>
        <div className="flex gap-2">
          <button
            onClick={() => setType('all_day')}
            className={`flex-1 py-2.5 rounded-full text-sm font-semibold ${
              type === 'all_day' ? 'bg-primary text-white' : 'bg-white border-[1.5px] border-gray-200 text-gray-400'
            }`}
          >
            하루종일
          </button>
          <button
            onClick={() => setType('timed')}
            className={`flex-1 py-2.5 rounded-full text-sm font-semibold ${
              type === 'timed' ? 'bg-primary text-white' : 'bg-white border-[1.5px] border-gray-200 text-gray-400'
            }`}
          >
            시간 지정
          </button>
        </div>
      </div>

      {/* Time Picker (timed only) */}
      {type === 'timed' && (
        <div className="flex gap-3 mb-4">
          <label className="flex-1">
            <span className="text-xs text-gray-400 block mb-1">시작</span>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="w-full px-3 py-2 bg-white border-[1.5px] border-gray-200 rounded-xl text-sm" />
          </label>
          <label className="flex-1">
            <span className="text-xs text-gray-400 block mb-1">종료</span>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
              className="w-full px-3 py-2 bg-white border-[1.5px] border-gray-200 rounded-xl text-sm" />
          </label>
        </div>
      )}

      {/* Verify Deadline */}
      <div className="mb-4">
        <span className="text-sm font-bold text-primary mb-1.5 block">
          인증 마감 시간
          <span className="font-normal text-gray-400 ml-1">
            ({type === 'timed' ? '종료' : '자정'} 후 {verifyDeadlineHours}시간)
          </span>
        </span>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={12}
            value={verifyDeadlineHours}
            onChange={e => setVerifyDeadlineHours(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="text-sm font-semibold text-primary w-16 text-right">{verifyDeadlineHours}시간</span>
        </div>
        <div className="text-xs text-gray-400 mt-1">
          {verifyDeadlineHours === 0
            ? `${type === 'timed' ? '금기 종료 즉시' : '자정에'} 미인증 처리`
            : `${type === 'timed' ? '금기 종료' : '자정'} 후 ${verifyDeadlineHours}시간까지 인증 가능`
          }
        </div>
      </div>

      {/* Recurring */}
      <label className="flex items-center gap-3 mb-8 cursor-pointer">
        <div
          onClick={() => setIsRecurring(!isRecurring)}
          className={`w-6 h-6 rounded-lg border-[1.5px] flex items-center justify-center text-xs ${
            isRecurring ? 'bg-primary border-primary text-white' : 'border-gray-300 bg-white'
          }`}
        >
          {isRecurring && '✓'}
        </div>
        <span className="text-sm text-primary">매일 반복</span>
      </label>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!title.trim() || saving}
        className="w-full py-3.5 bg-primary text-white rounded-full font-bold text-sm disabled:opacity-40"
      >
        {saving ? '저장 중...' : editTarget ? '수정하기' : '금기 추가하기'}
      </button>

      {editTarget && (
        <button
          onClick={handleDelete}
          className="w-full mt-2 py-3.5 bg-white border-[1.5px] border-fail-border rounded-full text-accent font-semibold text-sm"
        >
          금기 삭제하기
        </button>
      )}
    </div>
  )
}
