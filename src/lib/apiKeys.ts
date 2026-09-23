/**
 * Issuing, hashing and resolving API keys (issue #28).
 *
 * Keys are stored as SHA-256 hashes and the plaintext is shown once at
 * issuance, so a leak of the table does not hand over working credentials.
 *
 * SHA-256 rather than bcrypt or argon2 is deliberate. Those exist to slow down
 * guessing of low-entropy human passwords. These are 256 bits of CSPRNG output,
 * where guessing is already impossible, and a deliberately slow hash would be
 * paid on every single request instead.
 *
 * Lookup is by hash, which is the unique index, so verification is one read
 * and there is no secret-dependent comparison in this file to leak timing.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { supabase } from './supabase';
import { isTier, type Tier } from './tiers';

/** Identifies a TourneyRadar key on sight, in a log or a support request. */
const KEY_PREFIX = 'tr_live_';
/** 32 bytes of randomness, hex-encoded. */
const KEY_BYTES = 32;
/** How much of the key is kept in clear for display. */
const DISPLAY_PREFIX_LENGTH = KEY_PREFIX.length + 6;

export type ApiKeyRecord = {
  id: string;
  name: string;
  tier: Tier;
  revoked: boolean;
};

export function hashKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export function generateKey(): { key: string; hash: string; prefix: string } {
  const key = `${KEY_PREFIX}${randomBytes(KEY_BYTES).toString('hex')}`;
  return {
    key,
    hash: hashKey(key),
    prefix: key.slice(0, DISPLAY_PREFIX_LENGTH),
  };
}

/**
 * Pulls a key off a request.
 *
 * Accepts `Authorization: Bearer <key>` and `X-API-Key: <key>`. The first is
 * what most clients send by habit; the second is easier from a browser fetch
 * and from curl. Neither is preferred, and a request carrying both uses the
 * Authorization header.
 */
export function keyFromHeaders(headers: {
  get(name: string): string | null;
}): string | null {
  const authorization = headers.get('authorization');
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    if (match) return match[1].trim();
  }

  const header = headers.get('x-api-key');
  return header ? header.trim() : null;
}

/** Whether a string is even shaped like one of our keys, before any database work. */
export function looksLikeKey(key: string): boolean {
  return key.startsWith(KEY_PREFIX) && key.length === KEY_PREFIX.length + KEY_BYTES * 2;
}

/**
 * Resolves a presented key to its record, or null.
 *
 * Returns null for absent, malformed, unknown and revoked keys alike. The
 * caller turns that into an anonymous request rather than a 401: the API is
 * keyless, so a bad key means "no better ceiling than anyone else", not
 * "go away". A 401 here would also make the endpoint a free oracle for testing
 * whether a stolen key is still live.
 */
export async function resolveKey(key: string): Promise<ApiKeyRecord | null> {
  if (!looksLikeKey(key)) return null;

  try {
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, name, tier, revoked_at')
      .eq('key_hash', hashKey(key))
      .maybeSingle();

    if (error || !data) return null;
    if (data.revoked_at) return null;
    if (!isTier(data.tier)) return null;

    return { id: data.id, name: data.name, tier: data.tier, revoked: false };
  } catch {
    // A database outage must not take the API down. The request continues as
    // anonymous, which is a lower ceiling, never a higher one, so failing this
    // way cannot be used to escape a limit.
    return null;
  }
}

/**
 * Records one use of a key, best effort.
 *
 * Deliberately not awaited by the request path. Usage accounting is worth
 * having and is not worth adding a database round trip to every response, and
 * a counter that fails should never fail the request it was counting.
 */
export function recordUse(keyId: string): void {
  void supabase
    .rpc('record_api_key_use', { p_key_id: keyId })
    .then(({ error }) => {
      if (error) console.error('Usage not recorded:', error.message);
    });
}

/**
 * Compares two keys in constant time.
 *
 * Not used by resolveKey, which looks up by hash and so has nothing to leak.
 * Exported for any future path that has to compare a presented key against one
 * it already holds, so that path does not reach for `===`.
 */
export function keysEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
