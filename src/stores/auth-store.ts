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
        set({ session, loading: false })
        fetchOrCreateUser(session.user.id)
          .then(user => set({ user }))
          .catch(err => console.error('[Auth] fetchOrCreateUser failed:', err))
      } else {
        set({ session: null, user: null, loading: false })
      }
    })

    return () => subscription.unsubscribe()
  },

  loginWithKakao: async () => {
    if (Capacitor.isNativePlatform()) {
      const CALLBACK_URL = 'https://klyhyeon.github.io/nottodo/auth-callback.html'
      const { data } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: {
          redirectTo: CALLBACK_URL,
          skipBrowserRedirect: true,
        },
      })
      if (data?.url) {
        let processed = false

        await InAppBrowser.addListener('urlChangeEvent', async ({ url }) => {
          console.log('[OAuth] urlChange:', url.substring(0, 100))
          if (processed) return
          if (!url.includes('access_token')) return
          processed = true

          // 1. 토큰 추출
          const hash = url.includes('#') ? url.split('#')[1] : url.split('?')[1]
          if (!hash) return
          const params = new URLSearchParams(hash)
          const accessToken = params.get('access_token')
          const refreshToken = params.get('refresh_token')
          console.log('[OAuth] tokens found:', !!accessToken, !!refreshToken)
          if (!accessToken || !refreshToken) return

          // 로딩 상태로 전환 (로그인 페이지 대신 로딩 표시)
          set({ loading: true })

          // 2. 브라우저 닫기 + 리스너 정리 (반드시 setSession 전에)
          console.log('[OAuth] closing browser...')
          try { await InAppBrowser.close() } catch (_) { /* ignore */ }
          try { await InAppBrowser.removeAllListeners() } catch (_) { /* ignore */ }

          // 3. WKWebView 프로세스 종료 대기 (네트워크 블로킹 해제)
          await new Promise(r => setTimeout(r, 1500))

          // 4. 세션 설정 → onAuthStateChange가 자동으로 상태 업데이트
          console.log('[OAuth] setting session...')
          try {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })
            console.log('[OAuth] setSession result:', error ? `error: ${error.message}` : 'success')
          } catch (err) {
            console.error('[OAuth] setSession error:', err)
          } finally {
            set({ loading: false })
          }
        })

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
