import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { generateAnonymousName } from '../lib/anonymous-name'
import type { User } from '../lib/types'
import type { Session } from '@supabase/supabase-js'

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  initialize: () => Promise<void>
  loginWithKakao: () => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  loading: true,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const user = await fetchOrCreateUser(session.user.id)
      set({ session, user, loading: false })
    } else {
      set({ loading: false })
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        const user = await fetchOrCreateUser(session.user.id)
        set({ session, user })
      } else {
        set({ session: null, user: null })
      }
    })
  },

  loginWithKakao: async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: window.location.origin },
    })
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null })
  },
}))

async function fetchOrCreateUser(authId: string): Promise<User> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', authId)
    .single()

  if (data) return data as User

  const { name, emoji } = generateAnonymousName()
  const { data: newUser, error } = await supabase
    .from('users')
    .insert({ id: authId, anonymous_name: name, anonymous_emoji: emoji })
    .select()
    .single()

  if (error) throw error
  return newUser as User
}
