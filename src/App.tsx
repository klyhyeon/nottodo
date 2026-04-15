import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
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
    return () => { cleanup.then(unsub => unsub?.()) }
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
