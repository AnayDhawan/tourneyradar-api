/**
 * Tests for API key handling (issue #28).
 *
 * Two properties carry the security of this feature: a key is never stored in
 * a form that can be replayed, and a bad key never gets a better ceiling than
 * no key at all. Everything else is convenience.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const maybeSingle = vi.fn()
const rpc = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
    rpc: (...args: unknown[]) => {
      rpc(...args)
      return Promise.resolve({ error: null })
    },
  },
}))

import {
  generateKey,
  hashKey,
  keyFromHeaders,
  keysEqual,
  looksLikeKey,
  recordUse,
  resolveKey,
} from './apiKeys'

beforeEach(() => {
  maybeSingle.mockReset()
  rpc.mockReset()
})

const headers = (values: Record<string, string>) => new Headers(values)

describe('generateKey', () => {
  it('produces an identifiable, full-entropy key', () => {
    const { key } = generateKey()
    expect(key.startsWith('tr_live_')).toBe(true)
    // 32 bytes hex plus the prefix.
    expect(key).toHaveLength('tr_live_'.length + 64)
  })

  it('never repeats', () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateKey().key))
    expect(keys.size).toBe(200)
  })

  it('returns a hash that matches the key, and never the key itself', () => {
    const { key, hash } = generateKey()
    expect(hash).toBe(hashKey(key))
    expect(hash).not.toContain(key)
    expect(hash).toHaveLength(64)
  })

  it('keeps a display prefix short enough to be useless on its own', () => {
    const { key, prefix } = generateKey()
    expect(key.startsWith(prefix)).toBe(true)
    // Six hex characters of the secret: enough to tell two keys apart in a
    // list, nowhere near enough to guess the remaining 58.
    expect(prefix).toHaveLength('tr_live_'.length + 6)
  })
})

describe('hashKey', () => {
  it('is stable and case-sensitive', () => {
    expect(hashKey('tr_live_abc')).toBe(hashKey('tr_live_abc'))
    expect(hashKey('tr_live_abc')).not.toBe(hashKey('tr_live_ABC'))
  })
})

describe('keyFromHeaders', () => {
  it('reads a bearer token', () => {
    expect(keyFromHeaders(headers({ authorization: 'Bearer tr_live_abc' }))).toBe('tr_live_abc')
  })

  it('accepts any capitalisation of Bearer', () => {
    expect(keyFromHeaders(headers({ authorization: 'bearer tr_live_abc' }))).toBe('tr_live_abc')
  })

  it('reads the x-api-key header', () => {
    expect(keyFromHeaders(headers({ 'x-api-key': 'tr_live_abc' }))).toBe('tr_live_abc')
  })

  it('prefers Authorization when both are sent', () => {
    const value = keyFromHeaders(
      headers({ authorization: 'Bearer from_auth', 'x-api-key': 'from_header' })
    )
    expect(value).toBe('from_auth')
  })

  it('returns null when no key is presented', () => {
    expect(keyFromHeaders(headers({}))).toBeNull()
  })

  it('ignores an Authorization scheme it does not understand', () => {
    expect(keyFromHeaders(headers({ authorization: 'Basic abc123' }))).toBeNull()
  })
})

describe('looksLikeKey', () => {
  it('accepts a real key and rejects near misses', () => {
    expect(looksLikeKey(generateKey().key)).toBe(true)
    expect(looksLikeKey('tr_live_tooshort')).toBe(false)
    expect(looksLikeKey('sk_live_' + 'a'.repeat(64))).toBe(false)
    expect(looksLikeKey('')).toBe(false)
  })
})

describe('resolveKey', () => {
  it('resolves a live key to its tier', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: 'abc', name: 'Test', tier: 'bulk', revoked_at: null },
      error: null,
    })
    const record = await resolveKey(generateKey().key)
    expect(record).toEqual({ id: 'abc', name: 'Test', tier: 'bulk', revoked: false })
  })

  it('refuses a revoked key', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: 'abc', name: 'Test', tier: 'bulk', revoked_at: '2026-09-01T00:00:00Z' },
      error: null,
    })
    expect(await resolveKey(generateKey().key)).toBeNull()
  })

  it('refuses an unknown key', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await resolveKey(generateKey().key)).toBeNull()
  })

  it('refuses a key whose stored tier is not one we recognise', async () => {
    // A row edited by hand, or left behind by a tier that was removed. Falling
    // back to anonymous is the safe direction.
    maybeSingle.mockResolvedValue({
      data: { id: 'abc', name: 'Test', tier: 'unlimited', revoked_at: null },
      error: null,
    })
    expect(await resolveKey(generateKey().key)).toBeNull()
  })

  it('does not query the database for a malformed key', async () => {
    expect(await resolveKey('nonsense')).toBeNull()
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('degrades to anonymous when the database is unreachable', async () => {
    maybeSingle.mockRejectedValue(new Error('connection refused'))
    // Null means anonymous, which is a lower ceiling. An outage can never be
    // used to escape a limit.
    expect(await resolveKey(generateKey().key)).toBeNull()
  })

  it('degrades to anonymous on a query error', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await resolveKey(generateKey().key)).toBeNull()
  })
})

describe('recordUse', () => {
  it('increments through the atomic function rather than a read-modify-write', () => {
    recordUse('key-id')
    expect(rpc).toHaveBeenCalledWith('record_api_key_use', { p_key_id: 'key-id' })
  })
})

describe('keysEqual', () => {
  it('compares equal and unequal keys correctly', () => {
    expect(keysEqual('tr_live_abc', 'tr_live_abc')).toBe(true)
    expect(keysEqual('tr_live_abc', 'tr_live_abd')).toBe(false)
  })

  it('handles different lengths without throwing', () => {
    // timingSafeEqual rejects mismatched lengths, so this has to be guarded.
    expect(keysEqual('short', 'much longer string')).toBe(false)
  })
})
