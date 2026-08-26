# TourneyRadar API

A free, open-source REST API for over-the-board chess tournament data. 
No authentication required. No API key needed. This API currently serves 1800+ tournaments in 90+ countries.

**Base URL:** `https://tourneyradar-api.vercel.app`

**[Interactive docs](https://tourneyradar-api.vercel.app/docs)** — browse every endpoint and try requests against live data. Machine-readable spec at [`/openapi.json`](https://tourneyradar-api.vercel.app/openapi.json).

![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue)
![Status](https://img.shields.io/badge/status-live-brightgreen)

---

## Endpoints

### GET /v1/tournaments

Returns a paginated list of chess tournaments.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `country` | string | 2-letter country code (e.g. `IN`, `DE`, `US`) |
| `category` | string | `Classical`, `Rapid`, or `Blitz` |
| `upcoming` | boolean | `true` to return only future tournaments |
| `fide_rated` | boolean | `true` to return only FIDE rated tournaments |
| `limit` | number | Results per page (1–100, default 50) |
| `page` | number | Page number (default 1) |

**Example:**
GET /v1/tournaments?country=IN&upcoming=true&limit=5

**Response:**
```json
{
  "data": [
    {
      "id": "cr_1234567",
      "name": "Chennai Open 2026",
      "city": "Chennai",
      "country": "India",
      "country_code": "IN",
      "date": "2026-06-01",
      "end_date": "2026-06-07",
      "category": "Classical",
      "fide_rated": true,
      "rounds": 9,
      "format": "Swiss",
      "lat": 13.0827,
      "lng": 80.2707,
      "source_url": "https://chess-results.com/..."
    }
  ],
  "meta": {
    "page": 1,
    "limit": 5,
    "total": 248,
    "hasMore": true
  }
}
```

---

### GET /v1/tournaments/:id

Returns a single tournament by ID.

**Example:**
GET /v1/tournaments/cr_1371843

**Response:**
```json
{
  "data": { ...full tournament object }
}
```

---

### GET /v1/countries

Returns all countries that have tournament data.

**Example:**
GET /v1/countries

**Response:**
```json
{
  "data": [
    { "country_code": "IN", "country": "India" },
    { "country_code": "DE", "country": "Germany" }
  ]
}
```

---

### GET /v1/search

Full-text search across tournament name, organizer, and location.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search term. Required, minimum length 1 |
| `limit` | number | Results per page (1–1000, default 50) |
| `page` | number | Page number (minimum 1, default 1) |

PostgREST filter control characters (`(`, `)`, `,`) are stripped from `q` before it is matched, so they cannot break the underlying query.

**Example:**
GET /v1/search?q=open&limit=2

**Response:**
```json
{
  "data": [
    {
      "id": "cr_1350779",
      "name": "GPOA OPEN 2026 Přebor JmŠS v rapidu HD16, HD18 a HD20",
      "city": "Obchodní Akademie  Znojmo",
      "country": "Czech Republic",
      "country_code": "CZ",
      "date": "2026-03-25",
      "end_date": "2026-03-25",
      "category": "Rapid",
      "fide_rated": true,
      "rounds": 7,
      "format": "Swiss",
      "lat": 48.8564399,
      "lng": 16.0461196,
      "source_url": "https://chess-results.com/tnr1350779.aspx?lan=1"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 2,
    "total": 1695,
    "hasMore": true
  }
}
```

---

### GET /v1/stats

Aggregate figures across all published tournaments: how much data sits behind the API without paging through it.

**Example:**
GET /v1/stats

**Response:**
```json
{
  "data": {
    "total": 12989,
    "upcoming": 1620,
    "countries": 46,
    "byCategory": {
      "Classical": 230,
      "Rapid": 11884,
      "Blitz": 875
    },
    "lastScrapedAt": "2026-08-23T03:31:29.081+00:00"
  }
}
```

---

## Rate limiting

100 requests per minute per IP, backed by [Upstash Redis](https://upstash.com)
rather than process memory, so the limit actually holds across serverless
invocations. This replaces an earlier in-memory limiter that didn't
([#19](https://github.com/AnayDhawan/tourneyradar-api/issues/19)).

Every response carries `X-RateLimit-Limit` and `X-RateLimit-Remaining`. Once
exceeded, requests get `429` with a `Retry-After` header. If the Upstash store
is unreachable, the API fails open: requests pass through unlimited rather
than the whole API going down.

The limiter only activates once `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` are configured on the deployment (see
`.env.example`); without them it's a no-op, so self-hosted instances aren't
forced onto Upstash.

Please be reasonable regardless: responses are cached at the edge, so
hammering the same query gains you nothing. If you need bulk access, open an
issue and say what you are building.

---

## Quick start

**JavaScript / TypeScript**
```js
const res = await fetch(
  'https://tourneyradar-api.vercel.app/v1/tournaments?country=IN&upcoming=true&limit=5'
)
const { data, meta } = await res.json()
console.log(`Found ${meta.total} tournaments`)
console.log(data.map((tournament) => tournament.name))
```

**curl**
```bash
# List upcoming tournaments in India.
curl "https://tourneyradar-api.vercel.app/v1/tournaments?country=IN&upcoming=true&limit=5"

# Fetch a single tournament by id.
curl "https://tourneyradar-api.vercel.app/v1/tournaments/cr_1371843"
```

**Python**
```python
import requests

BASE_URL = 'https://tourneyradar-api.vercel.app'


def get_tournaments(country='IN'):
    page = 1
    tournaments = []

    while True:
        res = requests.get(
            f'{BASE_URL}/v1/tournaments',
            params={
                'country': country,
                'upcoming': 'true',
                'limit': 50,
                'page': page,
            },
            timeout=15,
        )
        res.raise_for_status()

        payload = res.json()
        tournaments.extend(payload['data'])

        if not payload['meta']['hasMore']:
            return tournaments

        page += 1


for tournament in get_tournaments('IN'):
    print(tournament['id'], tournament['name'])
```

**Handling missing tournaments**
```python
import requests

res = requests.get(
    'https://tourneyradar-api.vercel.app/v1/tournaments/not-a-real-id',
    timeout=15,
)

if res.status_code == 404:
    print(res.json())
    # {'error': 'Tournament not found', 'status': 404}
else:
    res.raise_for_status()
```

---

## Data

Tournament data is scraped weekly from [Chess-Results.com](https://chess-results.com)
and geocoded via the Google Maps API. Coverage grows with every weekly scrape run.

---

## Built with this API

> Using this API in your project? Open a PR to add it here.

---

## Related

- [TourneyRadar](https://github.com/AnayDhawan/tourneyradar) — the interactive 
  world map powered by this API

---

## Contributing

Contributions welcome. Please open an issue before submitting a PR for significant changes.

---

## Contributors

Thanks to everyone who has shipped a route, expanded the docs, or filed a fix.

[![Contributors](https://contrib.rocks/image?repo=AnayDhawan/tourneyradar-api)](https://github.com/AnayDhawan/tourneyradar-api/graphs/contributors)

---

## License

Apache-2.0 — see [LICENSE](./LICENSE)

---
