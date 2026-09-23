import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'

const mockLimit = vi.fn()

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(_config: unknown) {}
  },
}))

const mockResolveKey = vi.fn()
const mockRecordUse = vi.fn()
const slidingWindowCalls: Array<[number, string]> = []

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    limit = mockLimit
    static slidingWindow(tokens: number, window: string) {
      slidingWindowCalls.push([tokens, window])
      return {}
    }
  },
}))

// The middleware resolves an API key before choosing a tier (issue #28).
// Stubbed here so these tests stay about limiting rather than about Supabase.
vi.mock('../lib/apiKeys', () => ({
  keyFromHeaders: (headers: { get(name: string): string | null }) => {
    const authorization = headers.get('authorization')
    if (authorization) {
      const match = /^Bearer\s+(.+)$/i.exec(authorization.trim())
      if (match) return match[1].trim()
    }
    const header = headers.get('x-api-key')
    return header ? header.trim() : null
  },
  resolveKey: (key: string) => mockResolveKey(key),
  recordUse: (id: string) => mockRecordUse(id),
}))

const ORIGINAL_ENV = { ...process.env }

async function buildApp() {
  const { rateLimitMiddleware, _resetRatelimitForTests } = await import('./rate-limit.js')
  _resetRatelimitForTests()

  const app = new Hono()
  app.use('*', rateLimitMiddleware)
  app.get('/', (c) => c.text('ok'))
  return app
}

beforeEach(() => {
  vi.resetModules()
  mockLimit.mockReset()
  mockResolveKey.mockReset()
  mockResolveKey.mockResolvedValue(null)
  mockRecordUse.mockReset()
  slidingWindowCalls.length = 0
  process.env = { ...ORIGINAL_ENV }
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('rate limit middleware', () => {
  it('is a no-op when Upstash credentials are not set', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const app = await buildApp()
    const res = await app.request('/')

    expect(res.status).toBe(200)
    expect(res.headers.get('X-RateLimit-Limit')).toBeNull()
    expect(mockLimit).not.toHaveBeenCalled()
  })

  it('sets X-RateLimit headers and passes the request through under the limit', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    mockLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: Date.now() + 60_000 })

    const app = await buildApp()
    const res = await app.request('/')

    expect(res.status).toBe(200)
    expect(res.headers.get('X-RateLimit-Limit')).toBe('100')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('99')
  })

  it('returns 429 with Retry-After once the limit is exceeded', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    mockLimit.mockResolvedValue({ success: false, limit: 100, remaining: 0, reset: Date.now() + 5_000 })

    const app = await buildApp()
    const res = await app.request('/')

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()

    const body = await res.json()
    expect(body.error).toBe('Too many requests')
    expect(body.status).toBe(429)
    // A refused anonymous caller is told the thing that would help.
    expect(body.tier).toBe('anonymous')
    expect(body.hint).toContain('API key')
  })

  it('fails open when the store errors', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    mockLimit.mockRejectedValue(new Error('connection refused'))

    const app = await buildApp()
    const res = await app.request('/')

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('counts two addresses in one IPv6 /64 against the same key', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    mockLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: Date.now() + 60_000 })

    const app = await buildApp()
    await app.request('/', { headers: { 'x-forwarded-for': '2001:db8:85a3:8d3:1319:8a2e:370:7348' } })
    await app.request('/', { headers: { 'x-forwarded-for': '2001:db8:85a3:8d3:ffff:ffff:ffff:1' } })

    expect(mockLimit).toHaveBeenCalledTimes(2)
    expect(mockLimit.mock.calls[0][0]).toBe(mockLimit.mock.calls[1][0])
  })
})

describe('rateLimitKey', () => {
  const headers = (values: Record<string, string>) => ({
    get: (name: string) => values[name.toLowerCase()] ?? null,
  })

  async function key(values: Record<string, string>) {
    const { rateLimitKey } = await import('./rate-limit.js')
    return rateLimitKey(headers(values))
  }

  it('leaves an IPv4 address alone', async () => {
    expect(await key({ 'x-forwarded-for': '203.0.113.4' })).toBe('203.0.113.4')
  })

  it('takes the first hop of x-forwarded-for', async () => {
    expect(await key({ 'x-forwarded-for': '203.0.113.4, 70.41.3.18, 150.172.238.178' })).toBe('203.0.113.4')
  })

  it('falls back to x-real-ip, then to unknown', async () => {
    expect(await key({ 'x-real-ip': '203.0.113.9' })).toBe('203.0.113.9')
    expect(await key({})).toBe('unknown')
  })

  it('masks an IPv6 address to its /64 prefix', async () => {
    expect(await key({ 'x-forwarded-for': '2001:db8:85a3:8d3:1319:8a2e:370:7348' })).toBe('2001:db8:85a3:8d3::/64')
  })

  it('gives every address in a /64 the same key, which is the bypass this fixes', async () => {
    const a = await key({ 'x-forwarded-for': '2001:db8:85a3:8d3::1' })
    const b = await key({ 'x-forwarded-for': '2001:db8:85a3:8d3:abcd:ef01:2345:6789' })
    expect(a).toBe(b)
  })

  it('keeps separate /64s apart', async () => {
    const a = await key({ 'x-forwarded-for': '2001:db8:85a3:8d3::1' })
    const b = await key({ 'x-forwarded-for': '2001:db8:85a3:8d4::1' })
    expect(a).not.toBe(b)
  })

  it('expands a compressed address before masking', async () => {
    expect(await key({ 'x-forwarded-for': '2001:db8::1' })).toBe('2001:db8:0:0::/64')
    expect(await key({ 'x-forwarded-for': '::1' })).toBe('0:0:0:0::/64')
  })

  it('normalises leading zeros so one client is not two keys', async () => {
    const padded = await key({ 'x-forwarded-for': '2001:0db8:85a3:08d3::1' })
    const bare = await key({ 'x-forwarded-for': '2001:db8:85a3:8d3::1' })
    expect(padded).toBe(bare)
  })

  it('is case insensitive', async () => {
    const upper = await key({ 'x-forwarded-for': '2001:DB8:85A3:8D3::1' })
    const lower = await key({ 'x-forwarded-for': '2001:db8:85a3:8d3::1' })
    expect(upper).toBe(lower)
  })

  it('treats an IPv4-mapped address as the IPv4 client it is', async () => {
    expect(await key({ 'x-forwarded-for': '::ffff:203.0.113.4' })).toBe('203.0.113.4')
  })

  it('strips brackets, a port and a zone id', async () => {
    expect(await key({ 'x-forwarded-for': '[2001:db8:85a3:8d3::1]:443' })).toBe('2001:db8:85a3:8d3::/64')
    expect(await key({ 'x-forwarded-for': '203.0.113.4:5678' })).toBe('203.0.113.4')
    expect(await key({ 'x-forwarded-for': 'fe80::1%eth0' })).toBe('fe80:0:0:0::/64')
  })

  it('keys an unparseable value on itself rather than on a shared bucket', async () => {
    // Collapsing junk into one fallback key would put unrelated callers in the
    // same bucket, turning a malformed header into a denial of service.
    const a = await key({ 'x-forwarded-for': 'not:an:address:at:all:x:y:z' })
    const b = await key({ 'x-forwarded-for': 'also:not:an:address:q:r:s:t' })
    expect(a).not.toBe(b)
  })
})

describe('tiers (issue #28)', () => {
  const live = () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    mockLimit.mockResolvedValue({ success: true, limit: 600, remaining: 599, reset: Date.now() + 60_000 })
  }

  it('treats a request with no key as anonymous', async () => {
    live()
    const app = await buildApp()
    const res = await app.request('/')

    expect(res.headers.get('X-RateLimit-Tier')).toBe('anonymous')
    expect(slidingWindowCalls[0][0]).toBe(100)
  })

  it('gives a valid key its own tier and ceiling', async () => {
    live()
    mockResolveKey.mockResolvedValue({ id: 'key-1', name: 'Test', tier: 'bulk', revoked: false })

    const app = await buildApp()
    const res = await app.request('/', { headers: { authorization: 'Bearer tr_live_x' } })

    expect(res.headers.get('X-RateLimit-Tier')).toBe('bulk')
    expect(slidingWindowCalls[0][0]).toBe(6000)
  })

  it('counts a keyed request against the key, not the address', async () => {
    live()
    mockResolveKey.mockResolvedValue({ id: 'key-1', name: 'Test', tier: 'free', revoked: false })

    const app = await buildApp()
    await app.request('/', {
      headers: { authorization: 'Bearer tr_live_x', 'x-forwarded-for': '203.0.113.4' },
    })

    // A team behind one address should not compete with itself, and a key
    // should stay within its own budget wherever it is used from.
    expect(mockLimit.mock.calls[0][0]).toBe('key:key-1')
  })

  it('gives one key the same bucket from two different addresses', async () => {
    live()
    mockResolveKey.mockResolvedValue({ id: 'key-1', name: 'Test', tier: 'free', revoked: false })

    const app = await buildApp()
    await app.request('/', {
      headers: { authorization: 'Bearer tr_live_x', 'x-forwarded-for': '203.0.113.4' },
    })
    await app.request('/', {
      headers: { authorization: 'Bearer tr_live_x', 'x-forwarded-for': '198.51.100.9' },
    })

    expect(mockLimit.mock.calls[0][0]).toBe(mockLimit.mock.calls[1][0])
  })

  it('falls back to anonymous for a rejected key rather than refusing the request', async () => {
    live()
    // Unknown, revoked and malformed keys all resolve to null. The API is
    // keyless, so a bad key means no better ceiling than anyone else, not 401.
    mockResolveKey.mockResolvedValue(null)

    const app = await buildApp()
    const res = await app.request('/', { headers: { authorization: 'Bearer tr_live_revoked' } })

    expect(res.status).toBe(200)
    expect(res.headers.get('X-RateLimit-Tier')).toBe('anonymous')
    expect(slidingWindowCalls[0][0]).toBe(100)
  })

  it('never returns 401 for a bad key, which would leak whether it is live', async () => {
    live()
    mockResolveKey.mockResolvedValue(null)

    const app = await buildApp()
    const res = await app.request('/', { headers: { 'x-api-key': 'tr_live_stolen' } })

    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  it('records usage for a keyed request and not for an anonymous one', async () => {
    live()
    mockResolveKey.mockResolvedValue({ id: 'key-1', name: 'Test', tier: 'free', revoked: false })

    const app = await buildApp()
    await app.request('/', { headers: { authorization: 'Bearer tr_live_x' } })
    expect(mockRecordUse).toHaveBeenCalledWith('key-1')

    mockRecordUse.mockReset()
    mockResolveKey.mockResolvedValue(null)
    await app.request('/')
    expect(mockRecordUse).not.toHaveBeenCalled()
  })

  it('keeps a separate window per tier', async () => {
    live()
    const app = await buildApp()

    mockResolveKey.mockResolvedValue(null)
    await app.request('/')
    mockResolveKey.mockResolvedValue({ id: 'key-1', name: 'Test', tier: 'bulk', revoked: false })
    await app.request('/', { headers: { authorization: 'Bearer tr_live_x' } })

    // Two limiters built, with different ceilings. One shared instance would
    // give every tier whichever limit happened to be constructed first.
    expect(slidingWindowCalls.map((c) => c[0]).sort((a, b) => a - b)).toEqual([100, 6000])
  })

  it('still reports the tier when limiting is switched off', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    mockResolveKey.mockResolvedValue({ id: 'key-1', name: 'Test', tier: 'bulk', revoked: false })

    const app = await buildApp()
    const res = await app.request('/', { headers: { authorization: 'Bearer tr_live_x' } })

    expect(res.status).toBe(200)
    expect(res.headers.get('X-RateLimit-Tier')).toBe('bulk')
  })
})
