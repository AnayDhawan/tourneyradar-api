import type { MiddlewareHandler } from 'hono'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Cache hits never reach this middleware at all, they're served at the edge
// before the request gets here, so there is nothing to exempt in code.

function buildRatelimit(): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  // No credentials means no limiter, not a crash. This is what lets the repo
  // announce enforcement in the CHANGELOG before it actually turns on in
  // production: the code ships disabled until the env vars are set.
  if (!url || !token) return null

  return new Ratelimit({
    redis: new Redis({ url, token }),
    // Generous default per #19: 100 requests per minute per IP.
    limiter: Ratelimit.slidingWindow(100, '1 m'),
    analytics: false,
    prefix: 'tourneyradar-api',
  })
}

let ratelimit: Ratelimit | null | undefined

function getRatelimit(): Ratelimit | null {
  if (ratelimit === undefined) ratelimit = buildRatelimit()
  return ratelimit
}

function clientIp(headers: { get(name: string): string | null }): string {
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return headers.get('x-real-ip') ?? 'unknown'
}

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const limiter = getRatelimit()
  if (!limiter) return next()

  const ip = clientIp(c.req.raw.headers)

  try {
    const { success, limit, remaining, reset } = await limiter.limit(ip)

    c.header('X-RateLimit-Limit', String(limit))
    c.header('X-RateLimit-Remaining', String(remaining))

    if (!success) {
      const retryAfter = Math.max(0, Math.ceil((reset - Date.now()) / 1000))
      c.header('Retry-After', String(retryAfter))
      return c.json({ error: 'Too many requests', status: 429 }, 429)
    }
  } catch (err) {
    // A store outage should not take the whole API down. Fail open: let the
    // request through rather than 500ing or 429ing every caller.
    console.error('Rate limit check failed, failing open:', err)
  }

  return next()
}

// Exposed for tests, which need to force a rebuild after mocking env vars
// and the Upstash clients.
export function _resetRatelimitForTests() {
  ratelimit = undefined
}
