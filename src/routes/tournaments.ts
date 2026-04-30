import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { supabase } from '../lib/supabase'

const tournaments = new Hono()

const listSchema = z.object({
  country: z.string().length(3).toUpperCase().optional(),
  category: z.enum(['Classical', 'Rapid', 'Blitz']).optional(),
  upcoming: z.coerce.boolean().optional(),
  fide_rated: z.coerce.boolean().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  page: z.coerce.number().min(1).default(1),
})

tournaments.get('/', zValidator('query', listSchema), async (c) => {
  const { country, category, upcoming, fide_rated, limit, page } = c.req.valid('query')
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

  const { data, error, count } = await query

  if (error) {
    return c.json({ error: 'Failed to fetch tournaments', status: 500 }, 500)
  }

  const total = count ?? 0

  return c.json({
    data,
    meta: {
      page,
      limit,
      total,
      hasMore: offset + limit < total,
    }
  }, 200, {
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
  })
})

tournaments.get('/:id', async (c) => {
  const id = c.req.param('id')

  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .eq('status', 'published')
    .single()

  if (error || !data) {
    return c.json({ error: 'Tournament not found', status: 404 }, 404)
  }

  return c.json({ data }, 200, {
    'Cache-Control': 'public, s-maxage=300',
  })
})

export default tournaments
