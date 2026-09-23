import type { MiddlewareHandler } from 'hono'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { keyFromHeaders, recordUse, resolveKey } from '../lib/apiKeys'
import { limitFor, type Tier } from '../lib/tiers'

// Cache hits never reach this middleware at all, they're served at the edge
// before the request gets here, so there is nothing to exempt in code.

function redis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  // No credentials means no limiter, not a crash. This is what lets the repo
  // announce enforcement in the CHANGELOG before it actually turns on in
  // production: the code ships disabled until the env vars are set.
  if (!url || !token) return null
  return new Redis({ url, token })
}

// One limiter per tier (issue #28). They cannot share a window: the whole point
// of a tier is a different ceiling, and a single Ratelimit instance carries one.
// Separate prefixes also mean a key's budget is its own rather than shared with
// every anonymous caller behind the same address.
const limiters = new Map<Tier, Ratelimit | null>()
let store: Redis | null | undefined

function limiterFor(tier: Tier): Ratelimit | null {
  if (store === undefined) store = redis()
  if (!store) return null

  const existing = limiters.get(tier)
  if (existing !== undefined) return existing

  const limiter = new Ratelimit({
    redis: store,
    limiter: Ratelimit.slidingWindow(limitFor(tier), '1 m'),
    analytics: false,
    prefix: `tourneyradar-api:${tier}`,
  })
  limiters.set(tier, limiter)
  return limiter
}

function clientIp(headers: { get(name: string): string | null }): string {
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return headers.get('x-real-ip') ?? 'unknown'
}

/** Strips brackets, a port and a zone id, leaving a bare address. */
function bareAddress(raw: string): string {
  let addr = raw.trim()

  // [2001:db8::1]:443 -> 2001:db8::1
  if (addr.startsWith('[')) {
    const close = addr.indexOf(']')
    if (close > 0) return addr.slice(1, close).split('%')[0]
  }

  // 203.0.113.4:5678 -> 203.0.113.4. Only one colon, so this cannot be a bare
  // IPv6 address, which always has at least two.
  const firstColon = addr.indexOf(':')
  if (firstColon > 0 && addr.indexOf(':', firstColon + 1) === -1 && addr.includes('.')) {
    addr = addr.slice(0, firstColon)
  }

  return addr.split('%')[0]
}

/** The eight hextets of an IPv6 address, or null if it does not parse. */
function expandIpv6(addr: string): number[] | null {
  const halves = addr.split('::')
  if (halves.length > 2) return null

  const toHextets = (part: string): number[] | null => {
    if (part === '') return []
    const groups = part.split(':')
    const out: number[] = []
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      // A trailing dotted quad (::ffff:203.0.113.4) occupies two hextets.
      if (g.includes('.')) {
        if (i !== groups.length - 1) return null
        const octets = g.split('.')
        if (octets.length !== 4) return null
        const nums = octets.map((o) => (/^\d{1,3}$/.test(o) ? Number(o) : NaN))
        if (nums.some((n) => Number.isNaN(n) || n > 255)) return null
        out.push((nums[0] << 8) | nums[1], (nums[2] << 8) | nums[3])
        continue
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null
      out.push(parseInt(g, 16))
    }
    return out
  }

  const head = toHextets(halves[0])
  const tail = halves.length === 2 ? toHextets(halves[1]) : []
  if (head === null || tail === null) return null

  if (halves.length === 1) return head.length === 8 ? head : null

  const gap = 8 - head.length - tail.length
  if (gap < 1) return null
  return [...head, ...Array(gap).fill(0), ...tail]
}

/**
 * The key a request is counted against.
 *
 * An IPv4 client gets one address and keeps it. A residential IPv6 client is
 * typically handed a whole /64 by its ISP and can pick any address inside it
 * per request, so keying on the full address means the same real client lands
 * in a different bucket every time and the limit never binds. Masking to the
 * /64 counts the subscriber line rather than the address it happened to use.
 *
 * IPv4 is untouched, including the IPv4-mapped form some proxies emit. An
 * address that does not parse keys on itself rather than on a shared fallback,
 * so a malformed header cannot put unrelated callers in one bucket.
 */
export function rateLimitKey(headers: { get(name: string): string | null }): string {
  const raw = clientIp(headers)
  if (raw === 'unknown' || !raw.includes(':')) return raw

  const addr = bareAddress(raw)
  if (!addr.includes(':')) return addr

  const hextets = expandIpv6(addr)
  if (!hextets) return raw

  // ::ffff:203.0.113.4 is an IPv4 client arriving over an IPv6-aware proxy.
  // It carries no /64 to speak of, so it keys on the IPv4 address itself.
  const isIpv4Mapped =
    hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff
  if (isIpv4Mapped) {
    const a = hextets[6]
    const b = hextets[7]
    return `${a >> 8}.${a & 0xff}.${b >> 8}.${b & 0xff}`
  }

  const prefix = hextets
    .slice(0, 4)
    .map((h) => h.toString(16))
    .join(':')
  return `${prefix}::/64`
}

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  // A key raises the ceiling; it never gates access. An absent, malformed,
  // unknown or revoked key all resolve the same way: this is an anonymous
  // request. Rejecting a bad key with a 401 would also turn the endpoint into
  // a free oracle for checking whether a stolen key still works.
  const presented = keyFromHeaders(c.req.raw.headers)
  const record = presented ? await resolveKey(presented) : null
  const tier: Tier = record?.tier ?? 'anonymous'

  // Keyed requests count against the key, so a team behind one address is not
  // competing with itself, and a key stays within its own budget wherever it
  // is used from.
  const bucket = record ? `key:${record.id}` : rateLimitKey(c.req.raw.headers)

  c.header('X-RateLimit-Tier', tier)
  if (record) recordUse(record.id)

  const limiter = limiterFor(tier)
  if (!limiter) return next()

  try {
    const { success, limit, remaining, reset } = await limiter.limit(bucket)

    c.header('X-RateLimit-Limit', String(limit))
    c.header('X-RateLimit-Remaining', String(remaining))

    if (!success) {
      const retryAfter = Math.max(0, Math.ceil((reset - Date.now()) / 1000))
      c.header('Retry-After', String(retryAfter))
      return c.json(
        {
          error: 'Too many requests',
          status: 429,
          tier,
          hint:
            tier === 'anonymous'
              ? 'An API key raises this limit. See /docs.'
              : 'Slow down, or ask for a higher tier.',
        },
        429
      )
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
  store = undefined
  limiters.clear()
}
