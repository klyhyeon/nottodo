import { useState, useEffect } from 'react'

interface Props {
  endTime: string // "HH:MM" format
  onComplete: () => void
}

function getSecondsRemaining(endTime: string): number {
  const now = new Date()
  const [h, m] = endTime.split(':').map(Number)
  const end = new Date(now)
  end.setHours(h, m, 0, 0)
  const diff = end.getTime() - now.getTime()
  if (diff >= 0) {
    return Math.floor(diff / 1000)
  }
  // End time has passed today.
  // If it passed less than 12 hours ago, the prohibition window is over → show 0.
  // If it passed more than 12 hours ago, the endTime is "later today/tomorrow" → roll to next day.
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000
  if (Math.abs(diff) < TWELVE_HOURS_MS) {
    return 0
  }
  end.setDate(end.getDate() + 1)
  return Math.floor((end.getTime() - now.getTime()) / 1000)
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function CountdownTimer({ endTime, onComplete }: Props) {
  const [seconds, setSeconds] = useState(() => getSecondsRemaining(endTime))

  useEffect(() => {
    if (seconds <= 0) {
      onComplete()
      return
    }
    const interval = setInterval(() => {
      setSeconds(prev => {
        const next = prev - 1
        if (next <= 0) {
          clearInterval(interval)
          onComplete()
          return 0
        }
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [seconds, onComplete, endTime])

  return (
    <div className="text-5xl font-black font-serif text-primary tracking-wider text-center">
      {formatTime(seconds)}
    </div>
  )
}
