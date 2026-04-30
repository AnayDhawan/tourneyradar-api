import { Hono } from 'hono'
import { supabase } from '../lib/supabase'

const countries = new Hono()

countries.get('/', async (c) => {
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
