import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, type MockResult } from '../test/supabase-mock'

let mockResult: MockResult = { data: [], error: null }

vi.mock('../lib/supabase', () => ({
  get supabase() {
    return createSupabaseMock(mockResult)
  },
}))

import app from '../app'


beforeEach(() => {
  mockResult = {
    data: [
      { country_code: 'IN', country: 'India' },
      { country_code: 'DE', country: 'Germany' },
      { country_code: 'IN', country: 'India' },
    ],
    error: null,
  }
})

describe('GET /v1/countries', () => {
  it('deduplicates and sorts by country code', async () => {
    const res = await app.request('/v1/countries')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data).toEqual([
      { country_code: 'DE', country: 'Germany' },
      { country_code: 'IN', country: 'India' },
    ])
  })

  it('sets a long cache header', async () => {
    const res = await app.request('/v1/countries')
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=3600')
  })

  it('returns 500 when the query fails', async () => {
    mockResult = { data: null, error: { message: 'boom' } }
    const res = await app.request('/v1/countries')
    expect(res.status).toBe(500)
  })
})

describe('app shell', () => {
  it('serves the index route with the endpoint list', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.name).toBe('TourneyRadar API')
    expect(body.endpoints).toContain('GET /v1/search?q=')
  })

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await app.request('/v1/nope')
    expect(res.status).toBe(404)

    const body = await res.json()
    expect(body.error).toBe('Not found')
  })

  it('sets permissive CORS headers', async () => {
    const res = await app.request('/', { headers: { Origin: 'https://example.com' } })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})
