import { Hono } from 'hono'
import { corsMiddleware } from './middleware/cors'
import tournaments from './routes/tournaments'
import countries from './routes/countries'
import search from './routes/search'

// The app is built here and served in index.ts, so tests can import it and
// drive it through app.request() without binding a port.
const app = new Hono()

app.use('*', corsMiddleware)

app.get('/', (c) => c.json({
  name: 'TourneyRadar API',
  version: '1.0.0',
  docs: 'https://github.com/AnayDhawan/tourneyradar-api',
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

app.notFound((c) => c.json({ error: 'Not found', status: 404 }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error', status: 500 }, 500)
})

export default app
