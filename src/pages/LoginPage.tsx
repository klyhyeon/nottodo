import { useAuthStore } from '../stores/auth-store'

export default function LoginPage() {
  const loginWithKakao = useAuthStore(s => s.loginWithKakao)

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-6">
      <div className="w-20 h-20 rounded-full bg-cream-orange border-2 border-dashed border-gray-300 flex items-center justify-center mb-4">
        <span className="text-4xl font-black text-primary relative">
          ✕
          <span className="absolute -top-4 left-0.5 text-sm">👀</span>
        </span>
      </div>
      <h1 className="text-3xl font-black font-serif text-primary tracking-wider mb-2">NOT TO DO</h1>
      <p className="text-sm text-gray-400 text-center mb-8 leading-relaxed">
        무엇을 하지 않느냐가<br />당신을 만듭니다.
      </p>
      <button
        onClick={loginWithKakao}
        className="w-full max-w-xs py-3.5 bg-primary text-white rounded-full font-semibold text-sm"
      >
        🟡 카카오로 시작하기
      </button>
    </div>
  )
}
