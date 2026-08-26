import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { supabase } from '../lib/supabase'
import { arrayResponseSchema, countrySchema, errorSchema } from '../schemas'

const countries = new OpenAPIHono()

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Countries'],
  operationId: 'listCountries',
  summary: 'List countries that have tournament data',
  responses: {
    200: {
      description: 'Every distinct country with a published tournament',
      content: {
        'application/json': {
          schema: arrayResponseSchema(countrySchema),
        },
      },
    },
    500: {
      description: 'Query failed',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
})

countries.openapi(listRoute, async (c) => {
  const { data, error } = await supabase
    .from('tournaments')
    .select('country_code, country')
    .eq('status', 'published')
    .not('country_code', 'is', null)

  if (error) {
    return c.json({ error: 'Failed to fetch countries', status: 500 }, 500)
  }

  const unique = Array.from(
    new Map(data.map(r => [r.country_code, r])).values()
  ).sort((a, b) => (a.country_code ?? '').localeCompare(b.country_code ?? ''))

  return c.json({ data: unique }, 200, {
    'Cache-Control': 'public, s-maxage=3600',
  })
})

export default countries
