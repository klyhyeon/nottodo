import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { supabase } from './lib/supabase'
import { useAuthStore } from './stores/auth-store'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import ProhibitionDetailPage from './pages/ProhibitionDetailPage'
import FailedPage from './pages/FailedPage'
import ProhibitionNewPage from './pages/ProhibitionNewPage'
import ConfessionsPage from './pages/ConfessionsPage'
import SettingsPage from './pages/SettingsPage'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuthStore()
  if (loading) return <div className="min-h-screen bg-cream flex items-center justify-center text-2xl">⏳</div>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuthStore()
  if (loading) return <div className="min-h-screen bg-cream flex items-center justify-center text-2xl">⏳</div>
  if (session) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const initialize = useAuthStore(s => s.initialize)

  useEffect(() => {
    const cleanup = initialize()

    if (Capacitor.isNativePlatform()) {
      // 딥링크 콜백 (외부 브라우저에서 돌아온 경우 대비)
      CapApp.addListener('appUrlOpen', async ({ url }) => {
        if (url.includes('access_token') || url.includes('code=')) {
          const hashOrQuery = url.includes('#') ? url.split('#')[1] : url.split('?')[1]
          if (hashOrQuery) {
            const params = new URLSearchParams(hashOrQuery)
            const accessToken = params.get('access_token')
            const refreshToken = params.get('refresh_token')
            if (accessToken && refreshToken) {
              await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
            }
          }
        }
      })
    }

    return () => {
      cleanup.then(unsub => unsub?.())
      if (Capacitor.isNativePlatform()) {
        CapApp.removeAllListeners()
      }
    }
  }, [initialize])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route element={<AuthGuard><Layout /></AuthGuard>}>
          <Route path="/" element={<HomePage />} />
          <Route path="/prohibition/new" element={<ProhibitionNewPage />} />
          <Route path="/prohibition/:id" element={<ProhibitionDetailPage />} />
          <Route path="/prohibition/:id/failed" element={<FailedPage />} />
          <Route path="/confessions" element={<ConfessionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
