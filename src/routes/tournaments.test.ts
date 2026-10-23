import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, sampleTournament, type MockResult, type QueryCall } from '../test/supabase-mock'

let mockResult: MockResult = { data: [], error: null, count: 0 }
let queryCalls: QueryCall[] = []

vi.mock('../lib/supabase', () => ({
  get supabase() {
    return createSupabaseMock(mockResult, queryCalls)
  },
}))

import app from '../app'


beforeEach(() => {
  mockResult = { data: [sampleTournament], error: null, count: 1 }
  queryCalls = []
})

describe('GET /v1/tournaments', () => {
  it('returns data with pagination meta', async () => {
    const res = await app.request('/v1/tournaments')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.meta).toEqual({ page: 1, limit: 50, total: 1, hasMore: false })
  })

  it('sets the shared cache policy with stale-while-revalidate', async () => {
    const res = await app.request('/v1/tournaments')
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=3600')
    expect(res.headers.get('Cache-Control')).toContain('stale-while-revalidate')
  })

  it('returns an ETag and 304s a matching If-None-Match', async () => {
    const first = await app.request('/v1/tournaments')
    const etag = first.headers.get('ETag')
    expect(etag).toBeTruthy()

    const second = await app.request('/v1/tournaments', { headers: { 'If-None-Match': etag! } })
    expect(second.status).toBe(304)
    expect(await second.text()).toBe('')
  })

  it('rejects a country code that is not two characters', async () => {
    const res = await app.request('/v1/tournaments?country=IND')
    expect(res.status).toBe(400)
  })

  it('rejects an unknown category', async () => {
    const res = await app.request('/v1/tournaments?category=Bullet')
    expect(res.status).toBe(400)
  })

  it('accepts a known category', async () => {
    const res = await app.request('/v1/tournaments?category=Blitz')
    expect(res.status).toBe(200)
  })

  it.each([true, false])('applies fide_rated=%s as a boolean filter', async (value) => {
    const res = await app.request(`/v1/tournaments?fide_rated=${value}`)
    expect(res.status).toBe(200)
    expect(queryCalls.filter(({ method }) => method === 'eq')).toEqual([
      { method: 'eq', args: ['status', 'published'] },
      { method: 'eq', args: ['fide_rated', value] },
    ])
  })

  it.each([true, false])('uses the expected date filter for upcoming=%s', async (value) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-23T12:00:00Z'))
    try {
      const res = await app.request(`/v1/tournaments?upcoming=${value}`)
      expect(res.status).toBe(200)
      expect(queryCalls.filter(({ method }) => method === 'gte')).toEqual(
        value ? [{ method: 'gte', args: ['date', '2026-10-23'] }] : []
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves boolean filters unset when omitted', async () => {
    const res = await app.request('/v1/tournaments')
    expect(res.status).toBe(200)
    expect(queryCalls.filter(({ method }) => method === 'eq' || method === 'gte')).toEqual([
      { method: 'eq', args: ['status', 'published'] },
    ])
  })

  describe.each(['fide_rated', 'upcoming'])('%s validation', (param) => {
    it.each(['banana', '0', '1', '', 'TRUE', 'FALSE', ' true', 'false '])('rejects %j before querying', async (value) => {
      const res = await app.request(`/v1/tournaments?${param}=${encodeURIComponent(value)}`)
      expect(res.status).toBe(400)
      expect(queryCalls).toEqual([])
    })

    it.each(['true', 'false'])('rejects repeated values ending in %s', async (value) => {
      const res = await app.request(`/v1/tournaments?${param}=false&${param}=${value}`)
      expect(res.status).toBe(400)
      expect(queryCalls).toEqual([])
    })
  })

  it('preserves other filters and pagination alongside false booleans', async () => {
    mockResult.count = 21
    const res = await app.request(
      '/v1/tournaments?fide_rated=false&upcoming=false&country=in&category=Blitz' +
      '&date_from=2026-01-01&date_to=2026-12-31&organizer=Chess&limit=10&page=2'
    )
    expect(res.status).toBe(200)
    expect(queryCalls).toEqual([
      { method: 'select', args: ['*', { count: 'exact' }] },
      { method: 'eq', args: ['status', 'published'] },
      { method: 'order', args: ['date', { ascending: true }] },
      { method: 'range', args: [10, 19] },
      { method: 'eq', args: ['country_code', 'IN'] },
      { method: 'eq', args: ['category', 'Blitz'] },
      { method: 'eq', args: ['fide_rated', false] },
      { method: 'gte', args: ['date', '2026-01-01'] },
      { method: 'lte', args: ['date', '2026-12-31'] },
      { method: 'ilike', args: ['organizer_name', '%Chess%'] },
    ])
    const body = await res.json()
    expect(body.data).toEqual([sampleTournament])
    expect(body.meta).toEqual({ page: 2, limit: 10, total: 21, hasMore: true })
  })

  it('rejects a malformed date_from', async () => {
    const res = await app.request('/v1/tournaments?date_from=15-01-2027')
    expect(res.status).toBe(400)
  })

  it('rejects limit above the maximum', async () => {
    const res = await app.request('/v1/tournaments?limit=1001')
    expect(res.status).toBe(400)
  })

  it('rejects limit below the minimum', async () => {
    const res = await app.request('/v1/tournaments?limit=0')
    expect(res.status).toBe(400)
  })

  it('rejects a non-numeric limit', async () => {
    const res = await app.request('/v1/tournaments?limit=abc')
    expect(res.status).toBe(400)
  })

  it('rejects page below the minimum', async () => {
    const res = await app.request('/v1/tournaments?page=0')
    expect(res.status).toBe(400)
  })

  it('returns 500 when the query fails', async () => {
    mockResult = { data: null, error: { message: 'boom' }, count: 0 }
    const res = await app.request('/v1/tournaments')
    expect(res.status).toBe(500)
  })
})

describe('GET /v1/tournaments/:id', () => {
  it('returns a single tournament', async () => {
    mockResult = { data: sampleTournament, error: null }
    const res = await app.request('/v1/tournaments/cr_123456')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data.id).toBe('cr_123456')
  })

  // Regression guard for issue #14. Ids are scraper slugs like cr_123456, so
  // the validator must accept those while rejecting junk.
  it.each([
    ['../../etc/passwd', 'path traversal'],
    ['cr_1;drop table', 'semicolon and space'],
    ['cr 123', 'space'],
    ['%00', 'encoded null'],
    ['a'.repeat(65), 'over the length cap'],
  ])('rejects %s (%s)', async (id) => {
    const res = await app.request(`/v1/tournaments/${encodeURIComponent(id)}`)
    expect(res.status).toBe(400)
  })

  it.each(['cr_123456', 'CR-99', 'abc_123-XYZ'])('accepts the id shape %s', async (id) => {
    mockResult = { data: sampleTournament, error: null }
    const res = await app.request(`/v1/tournaments/${id}`)
    expect(res.status).toBe(200)
  })

  it('returns 404 when the tournament is missing', async () => {
    mockResult = { data: null, error: { message: 'not found' } }
    const res = await app.request('/v1/tournaments/cr_000000')
    expect(res.status).toBe(404)
  })

  it('sets the shared cache policy and 304s a matching If-None-Match', async () => {
    mockResult = { data: sampleTournament, error: null }
    const first = await app.request('/v1/tournaments/cr_123456')
    expect(first.headers.get('Cache-Control')).toContain('s-maxage=3600')

    const etag = first.headers.get('ETag')
    expect(etag).toBeTruthy()

    const second = await app.request('/v1/tournaments/cr_123456', { headers: { 'If-None-Match': etag! } })
    expect(second.status).toBe(304)
  })
})
