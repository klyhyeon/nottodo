export type ProhibitionType = 'all_day' | 'timed'
export type ProhibitionStatus = 'active' | 'succeeded' | 'failed' | 'unverified'
export type BadgeType = 'me_too' | 'tomorrow' | 'fighting'

export interface User {
  id: string
  anonymous_name: string
  anonymous_emoji: string
  created_at: string
}

export interface Prohibition {
  id: string
  user_id: string
  title: string
  emoji: string
  difficulty: number
  type: ProhibitionType
  start_time: string | null
  end_time: string | null
  date: string
  status: ProhibitionStatus
  is_recurring: boolean
  created_at: string
  updated_at: string
}

export interface Confession {
  id: string
  user_id: string
  prohibition_id: string
  content: string
  category: string
  created_at: string
  user?: Pick<User, 'anonymous_name' | 'anonymous_emoji'>
  badge_counts?: BadgeCounts
}

export interface Badge {
  id: string
  confession_id: string
  user_id: string
  type: BadgeType
  created_at: string
}

export interface BadgeCounts {
  me_too_count: number
  tomorrow_count: number
  fighting_count: number
}
