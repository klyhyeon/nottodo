export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getLocalToday(): string {
  return formatLocalDate(new Date())
}

export function getLocalYesterday(): string {
  const now = new Date()
  const yd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  return formatLocalDate(yd)
}
