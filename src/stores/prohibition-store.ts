import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Prohibition, ProhibitionStatus, ProhibitionType } from '../lib/types'

export function isValidTransition(from: ProhibitionStatus, to: ProhibitionStatus): boolean {
  return from === 'active' && (to === 'succeeded' || to === 'failed')
}

export function getVerifyDeadline(prohibition: Prohibition): Date {
  const date = new Date(prohibition.date + 'T00:00:00')
  if (prohibition.type === 'timed' && prohibition.end_time) {
    const [h, m] = prohibition.end_time.split(':').map(Number)
    date.setHours(h, m, 0, 0)
    // end_time이 start_time보다 작으면 자정을 넘긴 것 → 다음 날
    if (prohibition.start_time) {
      const [sh] = prohibition.start_time.split(':').map(Number)
      if (h < sh) date.setDate(date.getDate() + 1)
    }
  } else {
    // all_day: 자정이 기준
    date.setDate(date.getDate() + 1)
    date.setHours(0, 0, 0, 0)
  }
  date.setHours(date.getHours() + (prohibition.verify_deadline_hours ?? 0))
  return date
}

export function isDeadlinePassed(prohibition: Prohibition): boolean {
  return new Date() > getVerifyDeadline(prohibition)
}

export function calculateStreak(prohibitions: Prohibition[]): number {
  const sorted = [...prohibitions].sort((a, b) => b.date.localeCompare(a.date))
  let streak = 0
  for (const p of sorted) {
    if (p.status === 'succeeded') {
      streak++
    } else {
      break
    }
  }
  return streak
}

interface CreateProhibitionInput {
  title: string
  emoji: string
  difficulty: number
  type: ProhibitionType
  start_time?: string
  end_time?: string
  is_recurring: boolean
  verify_deadline_hours: number
}

interface ProhibitionState {
  prohibitions: Prohibition[]
  loading: boolean
  fetchToday: (userId: string) => Promise<void>
  fetchHistory: (userId: string, title: string) => Promise<Prohibition[]>
  create: (userId: string, input: CreateProhibitionInput) => Promise<void>
  updateStatus: (id: string, status: ProhibitionStatus) => Promise<void>
  deleteProhibition: (id: string) => Promise<void>
}

export const useProhibitionStore = create<ProhibitionState>((set, get) => ({
  prohibitions: [],
  loading: false,

  fetchToday: async (userId: string) => {
    set({ loading: true })
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const yd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    const yesterday = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, '0')}-${String(yd.getDate()).padStart(2, '0')}`

    // 오늘 + 어제(아직 인증 마감 안 된 것) 조회
    const { data, error } = await supabase
      .from('prohibitions')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .in('date', [today, yesterday])
      .order('created_at', { ascending: true })

    if (error) throw error

    const all = (data ?? []) as Prohibition[]

    // 인증 마감 지난 active 금기 → unverified로 변경
    const expired = all.filter(p => p.status === 'active' && isDeadlinePassed(p))
    for (const p of expired) {
      await supabase
        .from('prohibitions')
        .update({ status: 'unverified' })
        .eq('id', p.id)
      p.status = 'unverified'
    }

    // 반복 금기: 오늘 복사본이 없으면 가장 최근 반복 금기를 기반으로 생성
    const todayRecurringGroups = new Set(
      all
        .filter(p => p.date === today && p.is_recurring)
        .map(p => p.recurring_group_id ?? p.id)
    )

    const { data: recurringTemplates } = await supabase
      .from('prohibitions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_recurring', true)
      .is('deleted_at', null)
      .lt('date', today)
      .order('date', { ascending: false })

    if (recurringTemplates) {
      // 같은 recurring_group_id에서 가장 최근 것만 사용
      const seen = new Set<string>()
      for (const rec of recurringTemplates as Prohibition[]) {
        const recurringGroupId = rec.recurring_group_id ?? rec.id
        if (seen.has(recurringGroupId) || todayRecurringGroups.has(recurringGroupId)) continue
        seen.add(recurringGroupId)
        const { data: newP } = await supabase
          .from('prohibitions')
          .insert({
            user_id: userId,
            recurring_group_id: recurringGroupId,
            title: rec.title,
            emoji: rec.emoji,
            difficulty: rec.difficulty,
            type: rec.type,
            start_time: rec.start_time,
            end_time: rec.end_time,
            date: today,
            is_recurring: true,
            verify_deadline_hours: rec.verify_deadline_hours,
          })
          .select()
          .single()
        if (newP) all.push(newP as Prohibition)
      }
    }

    // 오늘 완료된 반복 금기 → 내일 복사본 생성
    const tmrw = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const tomorrow = `${tmrw.getFullYear()}-${String(tmrw.getMonth() + 1).padStart(2, '0')}-${String(tmrw.getDate()).padStart(2, '0')}`

    const completedTodayRecurring = all.filter(
      p => p.date === today && p.is_recurring && (p.status === 'succeeded' || p.status === 'failed')
    )

    for (const p of completedTodayRecurring) {
      const groupId = p.recurring_group_id ?? p.id
      const { data: newP } = await supabase
        .from('prohibitions')
        .insert({
          user_id: userId,
          recurring_group_id: groupId,
          title: p.title,
          emoji: p.emoji,
          difficulty: p.difficulty,
          type: p.type,
          start_time: p.start_time,
          end_time: p.end_time,
          date: tomorrow,
          is_recurring: true,
          verify_deadline_hours: p.verify_deadline_hours,
        })
        .select()
        .single()
      if (newP) all.push(newP as Prohibition)
    }

    // 반복 금기 그룹별 표시 우선순위 결정
    // 어제 active(미기록, 마감 전) > 오늘 active > 내일 active(오늘 완료 시) > 오늘 완료
    const yesterdayActiveGroups = new Set(
      all
        .filter(p => p.date === yesterday && p.status === 'active' && p.is_recurring && !isDeadlinePassed(p))
        .map(p => p.recurring_group_id ?? p.id)
    )
    const tomorrowGroups = new Set(
      all
        .filter(p => p.date === tomorrow && p.is_recurring)
        .map(p => p.recurring_group_id ?? p.id)
    )

    const visible = all.filter(p => {
      if (p.date === yesterday) {
        return p.status === 'active' && !isDeadlinePassed(p)
      }
      if (p.date === tomorrow) {
        // 내일 것: 오늘 완료된 반복 그룹만
        return true
      }
      if (p.date === today && p.is_recurring) {
        const groupId = p.recurring_group_id ?? p.id
        // 어제 active가 있으면 오늘 것 숨김
        if (yesterdayActiveGroups.has(groupId)) return false
        // 내일 것이 있으면(오늘 완료) 오늘 것 숨김
        if (tomorrowGroups.has(groupId)) return false
        return true
      }
      return p.date === today
    })

    set({ prohibitions: visible, loading: false })
  },

  fetchHistory: async (userId: string, title: string) => {
    const { data, error } = await supabase
      .from('prohibitions')
      .select('*')
      .eq('user_id', userId)
      .eq('title', title)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .limit(30)

    if (error) throw error
    return (data ?? []) as Prohibition[]
  },

  create: async (userId: string, input: CreateProhibitionInput) => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const { data, error } = await supabase
      .from('prohibitions')
      .insert({ ...input, user_id: userId, date: today })
      .select()
      .single()

    if (error) throw error
    set({ prohibitions: [...get().prohibitions, data as Prohibition] })
  },

  updateStatus: async (id: string, status: ProhibitionStatus) => {
    const prohibition = get().prohibitions.find(p => p.id === id)
    if (!prohibition || !isValidTransition(prohibition.status, status)) {
      throw new Error(`Invalid transition: ${prohibition?.status} → ${status}`)
    }

    const { error } = await supabase.rpc('update_prohibition_status', {
      prohibition_id: id,
      new_status: status,
    })

    if (error) throw error

    // 반복 금기 완료 시 → 내일 복사본 생성 후 오늘 것 대체
    if (prohibition.is_recurring && (status === 'succeeded' || status === 'failed')) {
      const now = new Date()
      const tmrw = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      const tomorrow = `${tmrw.getFullYear()}-${String(tmrw.getMonth() + 1).padStart(2, '0')}-${String(tmrw.getDate()).padStart(2, '0')}`
      const groupId = prohibition.recurring_group_id ?? prohibition.id

      const { data: tomorrowP } = await supabase
        .from('prohibitions')
        .insert({
          user_id: prohibition.user_id,
          recurring_group_id: groupId,
          title: prohibition.title,
          emoji: prohibition.emoji,
          difficulty: prohibition.difficulty,
          type: prohibition.type,
          start_time: prohibition.start_time,
          end_time: prohibition.end_time,
          date: tomorrow,
          is_recurring: true,
          verify_deadline_hours: prohibition.verify_deadline_hours,
        })
        .select()
        .single()

      if (tomorrowP) {
        // 오늘 완료 것 → 내일 것으로 교체
        set({
          prohibitions: get().prohibitions.map(p =>
            p.id === id ? (tomorrowP as Prohibition) : p
          ),
        })
        return
      }
    }

    // 내일 것 못 만든 경우 또는 비반복 → 상태만 업데이트
    set({
      prohibitions: get().prohibitions.map(p =>
        p.id === id ? { ...p, status } : p
      ),
    })
  },

  deleteProhibition: async (id: string) => {
    const { error } = await supabase
    .from('prohibitions')
    .update(  { deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    set({ prohibitions: get().prohibitions.filter(p => p.id !== id) })
  },
}))
