import { useLocation, useNavigate, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/', icon: '🚫', label: '금기' },
  { to: '/confessions', icon: '💬', label: '실패의 방' },
  { to: '/settings', icon: '⚙️', label: '설정' },
]

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  return (
    <div className="min-h-screen bg-cream flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <main className="flex-1 pb-24">
        <Outlet />
      </main>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-dashed border-gray-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', backgroundColor: '#FFFDF7' }}
      >
        <div style={{ display: 'flex', width: '100%' }}>
          {tabs.map(tab => (
            <a
              key={tab.to}
              href={tab.to}
              onClick={(e) => {
                e.preventDefault()
                navigate(tab.to)
              }}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '16px 0',
                minHeight: '60px',
                fontSize: '12px',
                textDecoration: 'none',
                cursor: 'pointer',
                color: isActive(tab.to) ? '#222222' : '#9ca3af',
                fontWeight: isActive(tab.to) ? 700 : 400,
              }}
            >
              <span style={{ fontSize: '20px' }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </a>
          ))}
        </div>
      </nav>
    </div>
  )
}
