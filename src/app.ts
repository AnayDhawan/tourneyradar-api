import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { corsMiddleware } from './middleware/cors'
import tournaments from './routes/tournaments'
import countries from './routes/countries'
import search from './routes/search'

// The app is built here and served in index.ts, so tests can import it and
// drive it through app.request() without binding a port.
const app = new OpenAPIHono()

app.use('*', corsMiddleware)

app.get('/', (c) => c.json({
  name: 'TourneyRadar API',
  version: '1.0.0',
  repository: 'https://github.com/AnayDhawan/tourneyradar-api',
  docs: '/docs',
  openapi: '/openapi.json',
  endpoints: [
    'GET /v1/tournaments',
    'GET /v1/tournaments/:id',
    'GET /v1/countries',
    'GET /v1/search?q=',
  ]
}))

app.route('/v1/tournaments', tournaments)
app.route('/v1/countries', countries)
app.route('/v1/search', search)

// Generated from the zod schemas each route already validates against, so the
// document cannot drift from what actually validates the way the hand-written
// rate-limiting docs did (see #10).
app.doc31('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'TourneyRadar API',
    version: '1.0.0',
    description: 'A free, keyless REST API for over-the-board chess tournament data.',
    license: { name: 'Apache-2.0', url: 'https://github.com/AnayDhawan/tourneyradar-api/blob/main/LICENSE' },
  },
  servers: [{ url: 'https://tourneyradar-api.vercel.app', description: 'Production' }],
})

app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'TourneyRadar API' }))

app.notFound((c) => c.json({ error: 'Not found', status: 404 }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error', status: 500 }, 500)
})

export default app
