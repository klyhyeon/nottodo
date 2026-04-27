import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { getLocalToday, getLocalYesterday } from '../lib/date-utils'
import type {
  Prohibition,
  ProhibitionTemplate,
  ProhibitionListItem,
  ProhibitionStatus,
  ProhibitionType,
} from '../lib/types'

// -- Pure functions (exported for testing) --

export function isValidTransition(from: ProhibitionStatus, to: ProhibitionStatus): boolean {
  return from === 'active' && (to === 'succeeded' || to === 'failed')
}

export function getVerifyDeadline(p: { date: string; type: ProhibitionType; end_time: string | null; start_time: string | null; verify_deadline_hours: number }): Date {
  const date = new Date(p.date + 'T00:00:00')
  if (p.type === 'timed' && p.end_time) {
    const [h, m] = p.end_time.split(':').map(Number)
    date.setHours(h, m, 0, 0)
    if (p.start_time) {
      const [sh] = p.start_time.split(':').map(Number)
      if (h < sh) date.setDate(date.getDate() + 1)
    }
  } else {
    date.setDate(date.getDate() + 1)
    date.setHours(0, 0, 0, 0)
  }
  date.setHours(date.getHours() + (p.verify_deadline_hours ?? 0))
  return date
}

export function isDeadlinePassed(p: { date: string; type: ProhibitionType; end_time: string | null; start_time: string | null; verify_deadline_hours: number }): boolean {
  return new Date() > getVerifyDeadline(p)
}

export function calculateStreak(prohibitions: Prohibition[]): number {
  const sorted = [...prohibitions].sort((a, b) => b.date.localeCompare(a.date))
  let streak = 0
  for (const p of sorted) {
    if (p.status === 'succeeded') streak++
    else break
  }
  return streak
}

/**
 * Pure merge: combines templates + instances into a flat list for display.
 * Rules:
 * - Template with no today-instance → status "active"
 * - Template with today-instance → show instance status
 * - If yesterday's instance is still active (deadline not passed) → show that instead
 * - One-off prohibitions (template_id = null) → show as-is
 * - One item per template, always
 */
export function mergeTemplatesAndInstances(
  templates: ProhibitionTemplate[],
  instances: Prohibition[],
  oneOffs: Prohibition[],
  today: string,
  yesterday: string,
): ProhibitionListItem[] {
  const items: ProhibitionListItem[] = []

  for (const tmpl of templates) {
    const todayInst = instances.find(i => i.template_id === tmpl.id && i.date === today)
    const yesterdayInst = instances.find(
      i => i.template_id === tmpl.id && i.date === yesterday && i.status === 'active' && !isDeadlinePassed(i)
    )

    if (yesterdayInst) {
      items.push({
        id: yesterdayInst.id,
        templateId: tmpl.id,
        title: tmpl.title,
        emoji: tmpl.emoji,
        difficulty: tmpl.difficulty,
        type: tmpl.type,
        start_time: tmpl.start_time,
        end_time: tmpl.end_time,
        date: yesterdayInst.date,
        status: 'active',
        verify_deadline_hours: tmpl.verify_deadline_hours,
        is_recurring: true,
      })
    } else if (todayInst) {
      items.push({
        id: todayInst.id,
        templateId: tmpl.id,
        title: tmpl.title,
        emoji: tmpl.emoji,
        difficulty: tmpl.difficulty,
        type: tmpl.type,
        start_time: tmpl.start_time,
        end_time: tmpl.end_time,
        date: todayInst.date,
        status: todayInst.status,
        verify_deadline_hours: tmpl.verify_deadline_hours,
        is_recurring: true,
      })
    } else {
      items.push({
        id: tmpl.id,
        templateId: tmpl.id,
        title: tmpl.title,
        emoji: tmpl.emoji,
        difficulty: tmpl.difficulty,
        type: tmpl.type,
        start_time: tmpl.start_time,
        end_time: tmpl.end_time,
        date: today,
        status: 'active',
        verify_deadline_hours: tmpl.verify_deadline_hours,
        is_recurring: true,
      })
    }
  }

  for (const p of oneOffs) {
    items.push({
      id: p.id,
      templateId: null,
      title: p.title,
      emoji: p.emoji,
      difficulty: p.difficulty,
      type: p.type,
      start_time: p.start_time,
      end_time: p.end_time,
      date: p.date,
      status: p.status,
      verify_deadline_hours: p.verify_deadline_hours,
      is_recurring: false,
    })
  }

  return items
}

// -- Store --

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
  items: ProhibitionListItem[]
  loading: boolean
  fetchToday: (userId: string) => Promise<void>
  fetchHistory: (userId: string, templateIdOrTitle: string) => Promise<Prohibition[]>
  create: (userId: string, input: CreateProhibitionInput) => Promise<void>
  updateStatus: (userId: string, item: ProhibitionListItem, status: ProhibitionStatus) => Promise<string>
  deleteProhibition: (item: ProhibitionListItem) => Promise<void>
}

export const useProhibitionStore = create<ProhibitionState>((set, get) => ({
  items: [],
  loading: false,

  fetchToday: async (userId: string) => {
    set({ loading: true })
    const today = getLocalToday()
    const yesterday = getLocalYesterday()

    const { data: templates } = await supabase
      .from('prohibition_templates')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .order('created_at', { ascending: true })

    const { data: instances } = await supabase
      .from('prohibitions')
      .select('*')
      .eq('user_id', userId)
      .not('template_id', 'is', null)
      .is('deleted_at', null)
      .in('date', [today, yesterday])

    const { data: oneOffs } = await supabase
      .from('prohibitions')
      .select('*')
      .eq('user_id', userId)
      .is('template_id', null)
      .is('deleted_at', null)
      .eq('date', today)
      .order('created_at', { ascending: true })

    // Expired active marking is handled by the cron job (mark-unverified).
    // Client-side marking would silently fail for rows older than yesterday
    // due to the RLS UPDATE policy (date >= CURRENT_DATE - 1 day).

    const items = mergeTemplatesAndInstances(
      (templates ?? []) as ProhibitionTemplate[],
      (instances ?? []) as Prohibition[],
      (oneOffs ?? []) as Prohibition[],
      today,
      yesterday,
    )

    set({ items, loading: false })
  },

  fetchHistory: async (userId: string, templateIdOrTitle: string) => {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(templateIdOrTitle)
    let query = supabase
      .from('prohibitions')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .limit(30)

    if (isUuid) {
      query = query.eq('template_id', templateIdOrTitle)
    } else {
      query = query.eq('title', templateIdOrTitle)
    }

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as Prohibition[]
  },

  create: async (userId: string, input: CreateProhibitionInput) => {
    const today = getLocalToday()

    if (input.is_recurring) {
      const { error } = await supabase
        .from('prohibition_templates')
        .insert({
          user_id: userId,
          title: input.title,
          emoji: input.emoji,
          difficulty: input.difficulty,
          type: input.type,
          start_time: input.type === 'timed' ? input.start_time : null,
          end_time: input.type === 'timed' ? input.end_time : null,
          verify_deadline_hours: input.verify_deadline_hours,
        })
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('prohibitions')
        .insert({
          user_id: userId,
          title: input.title,
          emoji: input.emoji,
          difficulty: input.difficulty,
          type: input.type,
          start_time: input.type === 'timed' ? input.start_time : null,
          end_time: input.type === 'timed' ? input.end_time : null,
          date: today,
          is_recurring: false,
          verify_deadline_hours: input.verify_deadline_hours,
        })
      if (error) throw error
    }

    await get().fetchToday(userId)
  },

  updateStatus: async (userId: string, item: ProhibitionListItem, status: ProhibitionStatus): Promise<string> => {
    if (!isValidTransition(item.status, status)) {
      throw new Error(`Invalid transition: ${item.status} → ${status}`)
    }

    let resolvedId = item.id

    if (item.templateId && item.templateId === item.id) {
      // Template shown as "active" (no instance yet) — create the instance
      const today = getLocalToday()
      const { data, error } = await supabase
        .from('prohibitions')
        .insert({
          template_id: item.templateId,
          user_id: userId,
          title: item.title,
          emoji: item.emoji,
          difficulty: item.difficulty,
          type: item.type,
          start_time: item.start_time,
          end_time: item.end_time,
          date: item.date || today,
          status,
          is_recurring: true,
          verify_deadline_hours: item.verify_deadline_hours,
        })
        .select()
        .single()
      if (error) throw error
      resolvedId = data.id
    } else {
      // Existing instance — use RPC for safe transition
      const { error } = await supabase.rpc('update_prohibition_status', {
        prohibition_id: item.id,
        new_status: status,
      })
      if (error) throw error
    }

    // Refresh from DB to avoid race with fetchToday interval
    await get().fetchToday(userId)

    return resolvedId
  },

  deleteProhibition: async (item: ProhibitionListItem) => {
    if (item.templateId) {
      // Deactivate template
      const { error } = await supabase
        .from('prohibition_templates')
        .update({ active: false })
        .eq('id', item.templateId)
      if (error) throw error

      // Also soft-delete today's instance if it exists
      if (item.id !== item.templateId) {
        await supabase
          .from('prohibitions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', item.id)
      }
    } else {
      const { error } = await supabase
        .from('prohibitions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', item.id)
      if (error) throw error
    }

    set({ items: get().items.filter(i => i.id !== item.id) })
  },
}))
