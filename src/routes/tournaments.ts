import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { supabase } from '../lib/supabase'
import { errorSchema, paginatedResponseSchema, singleResponseSchema, tournamentSchema } from '../schemas'

const tournaments = new OpenAPIHono()

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

const listQuerySchema = z.object({
  country: z.string().length(2).toUpperCase().optional().openapi({ example: 'IN', description: '2-letter ISO country code' }),
  category: z.enum(['Classical', 'Rapid', 'Blitz']).optional().openapi({ example: 'Classical' }),
  upcoming: z.coerce.boolean().optional().openapi({ example: true }),
  fide_rated: z.coerce.boolean().optional().openapi({ example: true }),
  date_from: z.string().regex(ISO_DATE_REGEX, 'date_from must be an ISO date (YYYY-MM-DD)').optional().openapi({ example: '2026-01-01' }),
  date_to: z.string().regex(ISO_DATE_REGEX, 'date_to must be an ISO date (YYYY-MM-DD)').optional().openapi({ example: '2026-12-31' }),
  organizer: z.string().min(1).optional().openapi({ example: 'Chess Association' }),
  limit: z.coerce.number().min(1).max(1000).default(50).openapi({ example: 50 }),
  page: z.coerce.number().min(1).default(1).openapi({ example: 1 }),
})

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Tournaments'],
  operationId: 'listTournaments',
  summary: 'List tournaments',
  request: { query: listQuerySchema },
  responses: {
    200: {
      description: 'A page of published tournaments',
      content: { 'application/json': { schema: paginatedResponseSchema(tournamentSchema) } },
    },
    400: {
      description: 'Invalid query parameters',
      content: { 'application/json': { schema: errorSchema } },
    },
    500: {
      description: 'Query failed',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
})

tournaments.openapi(listRoute, async (c) => {
  const { country, category, upcoming, fide_rated, date_from, date_to, organizer, limit, page } = c.req.valid('query')
  const offset = (page - 1) * limit

  let query = supabase
    .from('tournaments')
    .select('*', { count: 'exact' })
    .eq('status', 'published')
    .order('date', { ascending: true })
    .range(offset, offset + limit - 1)

  if (country) query = query.eq('country_code', country)
  if (category) query = query.eq('category', category)
  if (fide_rated !== undefined) query = query.eq('fide_rated', fide_rated)
  if (upcoming) query = query.gte('date', new Date().toISOString().split('T')[0])
  if (date_from) query = query.gte('date', date_from)
  if (date_to) query = query.lte('date', date_to)
  if (organizer) query = query.ilike('organizer_name', `%${organizer}%`)

  const { data, error, count } = await query

  if (error) {
    return c.json({ error: 'Failed to fetch tournaments', status: 500 }, 500)
  }

  const total = count ?? 0

  return c.json(
    {
      data,
      meta: {
        page,
        limit,
        total,
        hasMore: offset + limit < total,
      },
    },
    200,
    { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' }
  )
})

// Ids are scraper-issued slugs, currently `cr_<chess-results id>`, so they are
// opaque strings rather than integers. Constrain the shape and length instead
// of coercing to a number, which would reject every real id.
const detailParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'id may only contain letters, digits, hyphens and underscores')
    .openapi({ param: { name: 'id', in: 'path' }, example: 'cr_1371843' }),
})

const detailRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Tournaments'],
  operationId: 'getTournament',
  summary: 'Get a single tournament by id',
  request: { params: detailParamSchema },
  responses: {
    200: {
      description: 'The tournament',
      content: { 'application/json': { schema: singleResponseSchema(tournamentSchema) } },
    },
    400: {
      description: 'Invalid id',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Tournament not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
})

tournaments.openapi(detailRoute, async (c) => {
  const { id } = c.req.valid('param')

  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .eq('status', 'published')
    .single()

  if (error || !data) {
    return c.json({ error: 'Tournament not found', status: 404 }, 404)
  }

  return c.json({ data }, 200, { 'Cache-Control': 'public, s-maxage=300' })
})

export default tournaments
