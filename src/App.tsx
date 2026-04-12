import { BrowserRouter, Routes, Route } from 'react-router-dom'

function Placeholder({ name }: { name: string }) {
  return <div className="min-h-screen bg-cream p-6 font-serif text-primary text-2xl font-bold">{name}</div>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Placeholder name="로그인" />} />
        <Route path="/" element={<Placeholder name="오늘의 금기" />} />
        <Route path="/prohibition/new" element={<Placeholder name="금기 추가" />} />
        <Route path="/prohibition/:id" element={<Placeholder name="금기 상세" />} />
        <Route path="/prohibition/:id/failed" element={<Placeholder name="실패" />} />
        <Route path="/confessions" element={<Placeholder name="실패의 방" />} />
        <Route path="/settings" element={<Placeholder name="설정" />} />
      </Routes>
    </BrowserRouter>
  )
}
