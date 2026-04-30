import { Context, Next } from 'hono'

const requests = new Map<string, { count: number; resetAt: number }>()

export async function rateLimit(c: Context, next: Next) {
  const ip = c.req.header('x-forwarded-for') ?? 'unknown'
  const now = Date.now()
  const windowMs = 60 * 1000
  const limit = 60

  const current = requests.get(ip)

  if (!current || now > current.resetAt) {
    requests.set(ip, { count: 1, resetAt: now + windowMs })
    c.header('X-RateLimit-Limit', String(limit))
    c.header('X-RateLimit-Remaining', String(limit - 1))
    return next()
  }

  if (current.count >= limit) {
    return c.json({ error: 'Too many requests', status: 429 }, 429)
  }

  current.count++
  c.header('X-RateLimit-Limit', String(limit))
  c.header('X-RateLimit-Remaining', String(limit - current.count))
  return next()
}
