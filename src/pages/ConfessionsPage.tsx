import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/auth-store'
import ConfessionCard from '../components/ConfessionCard'
import CategoryFilter from '../components/CategoryFilter'
import type { Confession, BadgeType } from '../lib/types'

export default function ConfessionsPage() {
  const user = useAuthStore(s => s.user)
  const [confessions, setConfessions] = useState<Confession[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [userBadges, setUserBadges] = useState<Record<string, BadgeType[]>>({})
  const [categories, setCategories] = useState<string[]>([])

  useEffect(() => {
    fetchCategories()
  }, [])

  useEffect(() => {
    fetchConfessions()
  }, [selectedCategory])

  useEffect(() => {
    if (user) fetchUserBadges()
  }, [user])

  async function fetchCategories() {
    const { data } = await supabase
      .from('confessions')
      .select('category')
    if (data) {
      const unique = [...new Set(data.map(d => d.category))].filter(Boolean)
      setCategories(unique)
    }
  }

  async function fetchConfessions() {
    setLoading(true)
    let query = supabase
      .from('confessions')
      .select('*, user:users(anonymous_name, anonymous_emoji)')
      .order('created_at', { ascending: false })
      .limit(50)

    if (selectedCategory) {
      query = query.eq('category', selectedCategory)
    }

    const { data } = await query
    if (data) {
      const withCounts = await Promise.all(
        data.map(async (c: Confession) => {
          const { data: counts } = await supabase
            .from('confession_badge_counts')
            .select('*')
            .eq('confession_id', c.id)
            .single()
          return { ...c, badge_counts: counts ?? { me_too_count: 0, tomorrow_count: 0, fighting_count: 0 } }
        })
      )
      setConfessions(withCounts)
    }
    setLoading(false)
  }

  async function fetchUserBadges() {
    if (!user) return
    const { data } = await supabase
      .from('badges')
      .select('confession_id, type')
      .eq('user_id', user.id)

    if (data) {
      const map: Record<string, BadgeType[]> = {}
      for (const b of data) {
        if (!map[b.confession_id]) map[b.confession_id] = []
        map[b.confession_id].push(b.type as BadgeType)
      }
      setUserBadges(map)
    }
  }

  async function handleBadge(confessionId: string, type: BadgeType) {
    if (!user) return
    const existing = userBadges[confessionId]?.includes(type)

    if (existing) {
      await supabase
        .from('badges')
        .delete()
        .eq('confession_id', confessionId)
        .eq('user_id', user.id)
        .eq('type', type)
    } else {
      await supabase
        .from('badges')
        .insert({ confession_id: confessionId, user_id: user.id, type })
    }

    await fetchUserBadges()
    await fetchConfessions()
  }

  return (
    <div className="p-5">
      <div className="mb-4">
        <h1 className="text-2xl font-black font-serif text-primary">실패의 방 💬</h1>
        <p className="text-xs text-gray-400">괜찮아, 우리 모두 그래</p>
      </div>

      <div className="mb-4">
        <CategoryFilter categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} />
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">불러오는 중...</div>
      ) : confessions.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <div className="text-4xl mb-3">💬</div>
          <div className="text-sm">아직 고백이 없어요</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {confessions.map(c => (
            <ConfessionCard
              key={c.id}
              confession={c}
              activeBadges={userBadges[c.id] ?? []}
              onBadge={handleBadge}
            />
          ))}
        </div>
      )}
    </div>
  )
}
