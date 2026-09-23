import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'

const mockLimit = vi.fn()

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(_config: unknown) {}
  },
}))

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    limit = mockLimit
    static slidingWindow(_tokens: number, _window: string) {
      return {}
    }
  },
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
    expect(body).toEqual({ error: 'Too many requests', status: 429 })
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
