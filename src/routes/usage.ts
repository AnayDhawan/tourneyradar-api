/**
 * GET /v1/usage
 *
 * What the presented key has spent, and what its ceiling is (issue #28).
 *
 * A key holder should be able to answer "am I near my limit" without waiting
 * to be refused, and without asking anyone. This is the only route on the API
 * that requires a key, because it is the only one that reports something
 * private: a caller's own usage.
 *
 * It reports the caller's own key and nothing else. There is no parameter for
 * looking at another key, deliberately, so this endpoint can never become a
 * way to enumerate or inspect other people's usage.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { keyFromHeaders, resolveKey } from '../lib/apiKeys'
import { supabase } from '../lib/supabase'
import { TIER_LIMITS } from '../lib/tiers'

const usage = new OpenAPIHono()

const UsageSchema = z.object({
  key: z.object({
    name: z.string(),
    tier: z.string(),
  }),
  limit: z.object({
    per_minute: z.number(),
    description: z.string(),
  }),
  usage: z.object({
    today: z.number(),
    last_30_days: z.number(),
    days: z.array(z.object({ day: z.string(), requests: z.number() })),
  }),
})

const route = createRoute({
  method: 'get',
  path: '/',
  summary: 'Usage for the presented API key',
  description:
    'Daily request counts for the key in the Authorization or X-API-Key header, ' +
    'with the ceiling for its tier. Requires a key: it reports your own usage and nothing else.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { 'application/json': { schema: UsageSchema } },
      description: 'Usage for the presented key',
    },
    401: { description: 'No valid API key presented' },
  },
})

usage.openapi(route, async (c) => {
  const presented = keyFromHeaders(c.req.raw.headers)
  const record = presented ? await resolveKey(presented) : null

  // The one place a 401 is right. Everywhere else a missing key just means the
  // anonymous tier, but there is no anonymous usage to report: without a key
  // there is no "you" to report on.
  if (!record) {
    return c.json(
      {
        error: 'An API key is required for this endpoint',
        status: 401,
        hint: 'Send it as "Authorization: Bearer <key>" or "X-API-Key: <key>".',
      },
      401
    )
  }

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('api_key_usage')
    .select('day, requests')
    .eq('key_id', record.id)
    .gte('day', since)
    .order('day', { ascending: false })

  if (error) {
    return c.json({ error: 'Could not read usage', status: 503 }, 503)
  }

  const days = (data ?? []).map((row) => ({ day: row.day as string, requests: Number(row.requests) }))
  const today = new Date().toISOString().slice(0, 10)
  const limits = TIER_LIMITS[record.tier]

  return c.json({
    key: { name: record.name, tier: record.tier },
    limit: { per_minute: limits.perMinute, description: limits.description },
    usage: {
      today: days.find((d) => d.day === today)?.requests ?? 0,
      last_30_days: days.reduce((sum, d) => sum + d.requests, 0),
      days,
    },
  })
})

export default usage
