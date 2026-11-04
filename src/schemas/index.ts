import { z } from '@hono/zod-openapi'

// Shared response building blocks. Route files compose these instead of
// redeclaring the envelope shape, so the OpenAPI document and the actual
// response envelope cannot drift apart the way the hand-written docs did.

export const errorSchema = z
  .object({
    error: z.string().openapi({ example: 'Tournament not found' }),
    status: z.number().openapi({ example: 404 }),
  })
  .openapi('Error')

export const metaSchema = z
  .object({
    page: z.number().openapi({ example: 1 }),
    limit: z.number().openapi({ example: 50 }),
    total: z.number().openapi({ example: 248 }),
    hasMore: z.boolean().openapi({ example: true }),
  })
  .openapi('PageMeta')

export const tournamentSchema = z
  .object({
    id: z.string().openapi({ example: 'cr_1371843' }),
    name: z.string().openapi({ example: 'Chennai Open 2026' }),
    location: z.string().optional().openapi({ example: 'Chennai, India' }),
    city: z.string().optional().openapi({ example: 'Chennai' }),
    state: z.string().optional().openapi({ example: 'Tamil Nadu' }),
    country: z.string().optional().openapi({ example: 'India' }),
    country_code: z.string().optional().openapi({ example: 'IN' }),
    lat: z.number().nullable().optional().openapi({ example: 13.0827 }),
    lng: z.number().nullable().optional().openapi({ example: 80.2707 }),
    category: z.enum(['Classical', 'Rapid', 'Blitz']).nullable().openapi({ example: 'Classical' }),
    date: z.string().openapi({ example: '2026-06-01' }),
    end_date: z.string().optional().openapi({ example: '2026-06-07' }),
    fide_rated: z.boolean().openapi({ example: true }),
    time_control: z.string().optional().openapi({ example: '90+30' }),
    rounds: z.number().optional().openapi({ example: 9 }),
    organizer_name: z.string().optional().openapi({ example: 'Chennai Chess Association' }),
    registration_link: z.string().nullable().optional(),
    source_url: z.string().optional().openapi({ example: 'https://chess-results.com/tnr1371843.aspx' }),
    status: z.string().openapi({ example: 'published' }),
    format: z.string().nullable().optional().openapi({ example: 'Swiss' }),
    min_rating: z.number().nullable().optional().openapi({ example: 1400 }),
    max_rating: z.number().nullable().optional().openapi({ example: 2200 }),
    external_link: z.string().nullable().optional(),
    source: z.string().nullable().optional().openapi({ example: 'chess-results' }),
    scraped_at: z.string().nullable().optional().openapi({ example: '2026-10-25T03:12:00Z' }),
  })
  .openapi('Tournament')

// The columns the tournament routes select, taken from the schema so the
// response cannot carry a key the OpenAPI document does not describe. The
// table has ~56 columns, including organizer contact fields that are not
// public (issue #34), so routes must never select '*'.
export const TOURNAMENT_COLUMNS = Object.keys(tournamentSchema.shape).join(', ')

export const statsSchema = z
  .object({
    total: z.number().openapi({ example: 1842, description: 'Total published tournaments' }),
    upcoming: z.number().openapi({ example: 612, description: 'Published tournaments with a date today or later' }),
    countries: z.number().openapi({ example: 94, description: 'Distinct countries with a published tournament' }),
    byCategory: z
      .object({
        Classical: z.number().openapi({ example: 1120 }),
        Rapid: z.number().openapi({ example: 480 }),
        Blitz: z.number().openapi({ example: 242 }),
      })
      .openapi({ description: 'Published tournament count per category' }),
    lastScrapedAt: z.string().nullable().openapi({ example: '2026-08-24T03:12:00Z', description: 'Timestamp of the most recent scrape run, or null if none recorded' }),
  })
  .openapi('Stats')

export const countrySchema = z
  .object({
    country_code: z.string().openapi({ example: 'IN' }),
    country: z.string().nullable().openapi({ example: 'India' }),
  })
  .openapi('Country')

export function paginatedResponseSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    meta: metaSchema,
  })
}

export function singleResponseSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: item,
  })
}

export function arrayResponseSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
  })
}
