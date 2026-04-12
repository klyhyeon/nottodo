import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Prohibition, ProhibitionStatus, ProhibitionType } from '../lib/types'

export function isValidTransition(from: ProhibitionStatus, to: ProhibitionStatus): boolean {
  return from === 'active' && (to === 'succeeded' || to === 'failed')
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
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('prohibitions')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .order('created_at', { ascending: true })

    if (error) throw error
    set({ prohibitions: (data ?? []) as Prohibition[], loading: false })
  },

  fetchHistory: async (userId: string, title: string) => {
    const { data, error } = await supabase
      .from('prohibitions')
      .select('*')
      .eq('user_id', userId)
      .eq('title', title)
      .order('date', { ascending: false })
      .limit(30)

    if (error) throw error
    return (data ?? []) as Prohibition[]
  },

  create: async (userId: string, input: CreateProhibitionInput) => {
    const today = new Date().toISOString().split('T')[0]
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

    const { error } = await supabase
      .from('prohibitions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
    set({
      prohibitions: get().prohibitions.map(p =>
        p.id === id ? { ...p, status, updated_at: new Date().toISOString() } : p
      ),
    })
  },

  deleteProhibition: async (id: string) => {
    const { error } = await supabase.from('prohibitions').delete().eq('id', id)
    if (error) throw error
    set({ prohibitions: get().prohibitions.filter(p => p.id !== id) })
  },
}))
