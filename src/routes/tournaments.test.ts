import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, sampleTournament, type MockResult } from '../test/supabase-mock'

let mockResult: MockResult = { data: [], error: null, count: 0 }

vi.mock('../lib/supabase', () => ({
  get supabase() {
    return createSupabaseMock(mockResult)
  },
}))

import app from '../app'


beforeEach(() => {
  mockResult = { data: [sampleTournament], error: null, count: 1 }
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
