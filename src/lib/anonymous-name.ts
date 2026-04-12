export const ADJECTIVES = [
  '참을성 없는', '용감한', '졸린', '배고픈', '호기심 많은',
  '엉뚱한', '느긋한', '부지런한', '수줍은', '대담한',
  '꼼꼼한', '덜렁거리는', '낙천적인', '신중한', '활발한',
]

export const ANIMALS = [
  { name: '판다', emoji: '🐼' },
  { name: '수달', emoji: '🦦' },
  { name: '고양이', emoji: '🐱' },
  { name: '강아지', emoji: '🐶' },
  { name: '토끼', emoji: '🐰' },
  { name: '곰', emoji: '🐻' },
  { name: '여우', emoji: '🦊' },
  { name: '펭귄', emoji: '🐧' },
  { name: '햄스터', emoji: '🐹' },
  { name: '코알라', emoji: '🐨' },
]

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function generateAnonymousName(): { name: string; emoji: string } {
  const adj = randomPick(ADJECTIVES)
  const animal = randomPick(ANIMALS)
  const num = Math.floor(Math.random() * 99) + 1
  return {
    name: `${adj} ${animal.name} #${num}`,
    emoji: animal.emoji,
  }
}
