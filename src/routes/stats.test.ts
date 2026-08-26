import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, type MockResult } from '../test/supabase-mock'

let mockResult: MockResult = { data: [], error: null, count: 0 }

vi.mock('../lib/supabase', () => ({
  get supabase() {
    return createSupabaseMock(mockResult)
  },
}))

import app from '../app'

beforeEach(() => {
  mockResult = {
    data: [{ country_code: 'IN', scraped_at: '2026-08-24T03:12:00Z' }],
    error: null,
    count: 42,
  }
})

describe('GET /v1/stats', () => {
  it('returns all five figures', async () => {
    const res = await app.request('/v1/stats')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data.total).toBe(42)
    expect(body.data.upcoming).toBe(42)
    expect(body.data.countries).toBe(1)
    expect(body.data.byCategory).toEqual({ Classical: 42, Rapid: 42, Blitz: 42 })
    expect(body.data.lastScrapedAt).toBe('2026-08-24T03:12:00Z')
  })

  it('reports lastScrapedAt as null when nothing has scraped_at set', async () => {
    mockResult = { data: [], error: null, count: 0 }
    const res = await app.request('/v1/stats')

    const body = await res.json()
    expect(body.data.lastScrapedAt).toBeNull()
    expect(body.data.countries).toBe(0)
  })

  it('sets the shared cache policy with an ETag', async () => {
    const res = await app.request('/v1/stats')
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=3600')
    expect(res.headers.get('Cache-Control')).toContain('stale-while-revalidate')
    expect(res.headers.get('ETag')).toBeTruthy()
  })

  it('304s a matching If-None-Match', async () => {
    const first = await app.request('/v1/stats')
    const etag = first.headers.get('ETag')

    const second = await app.request('/v1/stats', { headers: { 'If-None-Match': etag! } })
    expect(second.status).toBe(304)
  })

  it('returns 500 when a query fails', async () => {
    mockResult = { data: null, error: { message: 'boom' }, count: 0 }
    const res = await app.request('/v1/stats')
    expect(res.status).toBe(500)
  })
})
