import { describe, it, expect } from 'vitest'
import { generateAnonymousName, ANIMALS } from '../lib/anonymous-name'

describe('generateAnonymousName', () => {
  it('returns an object with name and emoji', () => {
    const result = generateAnonymousName()
    expect(result).toHaveProperty('name')
    expect(result).toHaveProperty('emoji')
  })

  it('name follows "{adjective} {animal} #{number}" format', () => {
    const result = generateAnonymousName()
    const pattern = /^.+ .+ #\d+$/
    expect(result.name).toMatch(pattern)
  })

  it('number is between 1 and 99', () => {
    for (let i = 0; i < 50; i++) {
      const result = generateAnonymousName()
      const num = parseInt(result.name.split('#')[1])
      expect(num).toBeGreaterThanOrEqual(1)
      expect(num).toBeLessThanOrEqual(99)
    }
  })

  it('emoji is one of the animal emojis', () => {
    const result = generateAnonymousName()
    const allEmojis = ANIMALS.map(a => a.emoji)
    expect(allEmojis).toContain(result.emoji)
  })
})
