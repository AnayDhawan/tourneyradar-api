/**
 * Tests for GET /v1/usage (issue #28).
 *
 * This is the one endpoint that requires a key, because it is the one that
 * reports something private. The property worth pinning is that it reports the
 * caller's own usage and has no way to ask about anyone else's.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockResolveKey = vi.fn()
const usageRows = { data: [] as Array<{ day: string; requests: number }>, error: null as unknown }

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
  recordUse: () => {},
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            order: () => Promise.resolve(usageRows),
          }),
        }),
      }),
    }),
  },
}))

import app from '../app'

const today = new Date().toISOString().slice(0, 10)

beforeEach(() => {
  mockResolveKey.mockReset()
  mockResolveKey.mockResolvedValue(null)
  usageRows.data = []
  usageRows.error = null
})

describe('GET /v1/usage', () => {
  it('401s without a key', async () => {
    const res = await app.request('/v1/usage')
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.hint).toContain('X-API-Key')
  })

  it('401s for a key that does not resolve', async () => {
    mockResolveKey.mockResolvedValue(null)
    const res = await app.request('/v1/usage', {
      headers: { authorization: 'Bearer tr_live_revoked' },
    })
    expect(res.status).toBe(401)
  })

  it('reports the key, its ceiling and its usage', async () => {
    mockResolveKey.mockResolvedValue({ id: 'key-1', name: 'Test key', tier: 'free', revoked: false })
    usageRows.data = [
      { day: today, requests: 12 },
      { day: '2026-09-01', requests: 30 },
    ]

    const res = await app.request('/v1/usage', {
      headers: { authorization: 'Bearer tr_live_x' },
    })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.key).toEqual({ name: 'Test key', tier: 'free' })
    expect(body.limit.per_minute).toBe(600)
    expect(body.usage.today).toBe(12)
    expect(body.usage.last_30_days).toBe(42)
    expect(body.usage.days).toHaveLength(2)
  })

  it('reports zero today rather than omitting it when nothing was used', async () => {
    mockResolveKey.mockResolvedValue({ id: 'key-1', name: 'Test key', tier: 'bulk', revoked: false })
    usageRows.data = [{ day: '2026-09-01', requests: 5 }]

    const body = await (await app.request('/v1/usage', {
      headers: { 'x-api-key': 'tr_live_x' },
    })).json()

    expect(body.usage.today).toBe(0)
    expect(body.limit.per_minute).toBe(6000)
  })

  it('handles a key that has never been used', async () => {
    mockResolveKey.mockResolvedValue({ id: 'key-1', name: 'Fresh', tier: 'free', revoked: false })
    usageRows.data = []

    const body = await (await app.request('/v1/usage', {
      headers: { 'x-api-key': 'tr_live_x' },
    })).json()

    expect(body.usage.today).toBe(0)
    expect(body.usage.last_30_days).toBe(0)
    expect(body.usage.days).toEqual([])
  })

  it('503s rather than 500s when usage cannot be read', async () => {
    mockResolveKey.mockResolvedValue({ id: 'key-1', name: 'Test', tier: 'free', revoked: false })
    usageRows.error = { message: 'boom' }

    const res = await app.request('/v1/usage', {
      headers: { 'x-api-key': 'tr_live_x' },
    })
    expect(res.status).toBe(503)
  })

  it('has no parameter for asking about another key', async () => {
    mockResolveKey.mockResolvedValue({ id: 'key-1', name: 'Mine', tier: 'free', revoked: false })
    usageRows.data = [{ day: today, requests: 7 }]

    // Whatever is passed, the answer describes the presented key. This endpoint
    // must never become a way to enumerate or inspect other people's usage.
    const body = await (await app.request('/v1/usage?key_id=someone-else&key=tr_live_other', {
      headers: { 'x-api-key': 'tr_live_mine' },
    })).json()

    expect(body.key.name).toBe('Mine')
    expect(mockResolveKey).toHaveBeenCalledWith('tr_live_mine')
  })
})

describe('the keyless promise', () => {
  it('serves the index and the spec without a key', async () => {
    // The point of the tiering work: a key raises a ceiling, it does not gate
    // access. A regression here would quietly turn a public API private.
    // Only routes that need no database are exercised here, so a failure is
    // about authentication rather than about this file's Supabase stub.
    for (const path of ['/', '/openapi.json']) {
      const res = await app.request(path)
      expect(res.status, `${path} should not require a key`).toBe(200)
    }
  })

  it('requires a key on /v1/usage and nowhere else in the spec', async () => {
    const spec = await (await app.request('/openapi.json')).json()
    const secured = Object.entries(spec.paths)
      .filter(([, methods]) =>
        Object.values(methods as Record<string, { security?: unknown[] }>).some(
          (op) => Array.isArray(op.security) && op.security.length > 0
        )
      )
      .map(([path]) => path)

    expect(secured).toEqual(['/v1/usage'])
  })

  it('declares the bearer scheme in the OpenAPI document', async () => {
    const spec = await (await app.request('/openapi.json')).json()
    expect(spec.components.securitySchemes.bearerAuth.scheme).toBe('bearer')
    expect(spec.paths['/v1/usage']).toBeDefined()
  })
})
