import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { inject } from '@vercel/analytics'
import { corsMiddleware } from './middleware/cors'
import { rateLimit } from './middleware/rateLimit'
import tournaments from './routes/tournaments'
import countries from './routes/countries'

// Initialize Vercel Analytics
inject()

const app = new Hono()

app.use('*', corsMiddleware)
app.use('*', rateLimit)

app.get('/', (c) => c.json({
  name: 'TourneyRadar API',
  version: '1.0.0',
  docs: 'https://github.com/AnayDhawan/tourneyradar-api',
  endpoints: [
    'GET /v1/tournaments',
    'GET /v1/tournaments/:id',
    'GET /v1/countries',
  ]
}))

app.route('/v1/tournaments', tournaments)
app.route('/v1/countries', countries)

app.notFound((c) => c.json({ error: 'Not found', status: 404 }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error', status: 500 }, 500)
})

const port = Number(process.env.PORT) || 3001
serve({ fetch: app.fetch, port }, () => {
  console.log(`TourneyRadar API running on http://localhost:${port}`)
})

export default app
