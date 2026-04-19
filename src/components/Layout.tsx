import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/', icon: '🚫', label: '금기' },
  { to: '/confessions', icon: '💬', label: '실패의 방' },
  { to: '/settings', icon: '⚙️', label: '설정' },
]

export default function Layout() {
  return (
    <div className="min-h-screen bg-cream flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <main className="flex-1 pb-24">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 bg-cream border-t border-dashed border-gray-200" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex justify-around py-3 max-w-md mx-auto">
          {tabs.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 text-xs ${isActive ? 'text-primary font-bold' : 'text-gray-400'}`
              }
            >
              <span className="text-xl">{tab.icon}</span>
              <span>{tab.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
