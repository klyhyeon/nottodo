import { useAuthStore } from '../stores/auth-store'

export default function SettingsPage() {
  const { user, logout } = useAuthStore()

  return (
    <div className="p-5">
      <h1 className="text-2xl font-black font-serif text-primary mb-6">설정</h1>

      <div className="p-4 bg-white rounded-2xl border-[1.5px] border-gray-100 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-cream-orange flex items-center justify-center text-2xl">
            {user?.anonymous_emoji}
          </div>
          <div>
            <div className="font-bold text-sm text-primary">{user?.anonymous_name}</div>
            <div className="text-xs text-gray-400">익명 프로필</div>
          </div>
        </div>
      </div>

      <button
        onClick={logout}
        className="w-full py-3.5 bg-white border-[1.5px] border-gray-200 rounded-full text-gray-400 font-semibold text-sm"
      >
        로그아웃
      </button>
    </div>
  )
}
