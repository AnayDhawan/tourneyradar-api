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
})
