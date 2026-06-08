import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { supabase } from '../lib/supabase'

const search = new Hono()

const searchSchema = z.object({
    q: z.string().min(1, 'Search query is required'),
    limit: z.coerce.number().min(1).max(1000).default(50),
    page: z.coerce.number().min(1).default(1),
})

search.get('/', zValidator('query', searchSchema), async (c) => {
    const { q, limit, page } = c.req.valid('query')
    const offset = (page - 1) * limit

    // Strip PostgREST filter control characters from user input so they cannot
    // break the .or() filter string (commas and parens are syntax delimiters).
    const safeQ = q.replace(/[(),]/g, '')
    const searchPattern = `%${safeQ}%`

    let query = supabase
        .from('tournaments')
        .select('*', { count: 'exact' })
        .eq('status', 'published')
        .or(
            `name.ilike.${searchPattern},organizer_name.ilike.${searchPattern},location.ilike.${searchPattern}`
        )
        .order('date', { ascending: true })
        .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
        return c.json({ error: 'Failed to search tournaments', status: 500 }, 500)
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
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    })
})

export default search
