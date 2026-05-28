const requestCounts = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(ip: string, limitPerMinute: number): boolean {
  const now = Date.now()
  const entry = requestCounts.get(ip)
  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= limitPerMinute) return false
  entry.count++
  return true
}
