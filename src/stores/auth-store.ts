import { create } from 'zustand'
import { Capacitor } from '@capacitor/core'
import { InAppBrowser } from '@capgo/inappbrowser'
import { supabase } from '../lib/supabase'
import { generateAnonymousName } from '../lib/anonymous-name'
import type { User } from '../lib/types'
import type { Session } from '@supabase/supabase-js'

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  initialize: () => Promise<(() => void) | undefined>
  loginWithKakao: () => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        const user = await fetchOrCreateUser(session.user.id)
        set({ session, user })
      } else {
        set({ session: null, user: null })
      }
    })

    return () => subscription.unsubscribe()
  },

  loginWithKakao: async () => {
    if (Capacitor.isNativePlatform()) {
      const { data } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: {
          redirectTo: 'https://bvkdawbdcjrnduuuzwhl.supabase.co',
          skipBrowserRedirect: true,
        },
      })
      if (data?.url) {
        // URL 변경 감지 리스너 등록
        await InAppBrowser.addListener('urlChangeEvent', async ({ url }) => {
          if (url.includes('access_token') || url.includes('#access_token')) {
            const hash = url.includes('#') ? url.split('#')[1] : url.split('?')[1]
            if (hash) {
              const params = new URLSearchParams(hash)
              const accessToken = params.get('access_token')
              const refreshToken = params.get('refresh_token')
              if (accessToken && refreshToken) {
                await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken,
                })
              }
            }
            await InAppBrowser.close()
            await InAppBrowser.removeAllListeners()
          }
        })

        // 사용자가 웹뷰를 닫았을 때 리스너 정리
        await InAppBrowser.addListener('closeEvent', async () => {
          await InAppBrowser.removeAllListeners()
        })

        // WKWebView 기반 인앱 브라우저로 OAuth 페이지 열기
        await InAppBrowser.openWebView({
          url: data.url,
          title: '카카오 로그인',
        })
      }
    } else {
      await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: { redirectTo: window.location.origin },
      })
    }
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
