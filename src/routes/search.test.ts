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

describe('GET /v1/search', () => {
  it('requires a query', async () => {
    const res = await app.request('/v1/search')
    expect(res.status).toBe(400)
  })

  it('rejects an empty query', async () => {
    const res = await app.request('/v1/search?q=')
    expect(res.status).toBe(400)
  })

  it('returns results with pagination meta', async () => {
    const res = await app.request('/v1/search?q=mumbai')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.meta).toEqual({ page: 1, limit: 50, total: 1, hasMore: false })
  })

  it('reports hasMore when the total exceeds the page', async () => {
    mockResult = { data: [sampleTournament], error: null, count: 500 }
    const res = await app.request('/v1/search?q=open&limit=10')

    const body = await res.json()
    expect(body.meta.hasMore).toBe(true)
  })

  // PostgREST treats commas and parens as .or() syntax, so they are stripped
  // before the filter string is built. A crafted query must not 500.
  it.each(['a,b', 'x(y)', 'name.ilike.%,id.eq.1'])(
    'survives PostgREST control characters in %s',
    async (q) => {
      const res = await app.request(`/v1/search?q=${encodeURIComponent(q)}`)
      expect(res.status).toBe(200)
    }
  )

  it('rejects limit above the maximum', async () => {
    const res = await app.request('/v1/search?q=open&limit=1001')
    expect(res.status).toBe(400)
  })

  it('returns 500 when the query fails', async () => {
    mockResult = { data: null, error: { message: 'boom' }, count: 0 }
    const res = await app.request('/v1/search?q=open')
    expect(res.status).toBe(500)
  })

  it('sets the shared cache policy with stale-while-revalidate', async () => {
    const res = await app.request('/v1/search?q=open')
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=3600')
    expect(res.headers.get('Cache-Control')).toContain('stale-while-revalidate')
  })

  it('returns an ETag and 304s a matching If-None-Match', async () => {
    const first = await app.request('/v1/search?q=open')
    const etag = first.headers.get('ETag')
    expect(etag).toBeTruthy()

    const second = await app.request('/v1/search?q=open', { headers: { 'If-None-Match': etag! } })
    expect(second.status).toBe(304)
  })
})
