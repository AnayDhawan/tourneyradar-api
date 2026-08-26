import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { supabase } from '../lib/supabase'
import { errorSchema, singleResponseSchema, statsSchema } from '../schemas'
import { CACHE_CONTROL, etagFor } from '../lib/cache'

const stats = new OpenAPIHono()

const TOURNAMENT_CATEGORIES = ['Classical', 'Rapid', 'Blitz'] as const

const statsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Stats'],
  operationId: 'getStats',
  summary: 'Aggregate figures across all published tournaments',
  responses: {
    200: {
      description: 'Tournament totals, coverage, and the last scrape time',
      content: { 'application/json': { schema: singleResponseSchema(statsSchema) } },
    },
    500: {
      description: 'Query failed',
      content: { 'application/json': { schema: errorSchema } },
    },
    304: {
      description: 'Not modified, matches the If-None-Match ETag',
    },
  },
})

stats.openapi(statsRoute, async (c) => {
  const today = new Date().toISOString().split('T')[0]

  const [totalResult, upcomingResult, countryResult, categoryResults, lastScrapedResult] = await Promise.all([
    supabase
      .from('tournaments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published'),

    supabase
      .from('tournaments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published')
      .gte('date', today),

    // Just the one column PostgREST can dedupe cheaply. There is no
    // SELECT DISTINCT over PostgREST without a database function, so the
    // set dedup happens here rather than pulling every column.
    supabase
      .from('tournaments')
      .select('country_code')
      .eq('status', 'published')
      .not('country_code', 'is', null),

    Promise.all(
      TOURNAMENT_CATEGORIES.map((category) =>
        supabase
          .from('tournaments')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'published')
          .eq('category', category)
      )
    ),

    supabase
      .from('tournaments')
      .select('scraped_at')
      .eq('status', 'published')
      .not('scraped_at', 'is', null)
      .order('scraped_at', { ascending: false })
      .limit(1),
  ])

  const failed = [totalResult, upcomingResult, countryResult, lastScrapedResult, ...categoryResults].find(
    (r) => r.error
  )
  if (failed) {
    return c.json({ error: 'Failed to fetch stats', status: 500 }, 500)
  }

  const countries = new Set(
    (countryResult.data ?? []).map((r) => r.country_code).filter(Boolean)
  ).size

  const byCategory = Object.fromEntries(
    TOURNAMENT_CATEGORIES.map((category, i) => [category, categoryResults[i].count ?? 0])
  ) as Record<(typeof TOURNAMENT_CATEGORIES)[number], number>

  const body = {
    data: {
      total: totalResult.count ?? 0,
      upcoming: upcomingResult.count ?? 0,
      countries,
      byCategory,
      lastScrapedAt: lastScrapedResult.data?.[0]?.scraped_at ?? null,
    },
  }
  const etag = etagFor(body)
  const headers = { 'Cache-Control': CACHE_CONTROL, ETag: etag }

  if (c.req.header('If-None-Match') === etag) {
    return c.body(null, 304, headers)
  }

  return c.json(body, 200, headers)
})

export default stats
