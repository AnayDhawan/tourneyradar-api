# TourneyRadar API

A free, open-source REST API for over-the-board chess tournament data. 
No authentication required. No API key needed. This API currently serves 1800+ tournaments in 90+ countries.

**Base URL:** `https://tourneyradar-api.vercel.app`

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

## Rate limiting

There is currently no rate limiting. Earlier versions shipped an in-memory
limiter that did not actually limit anything across serverless invocations, so
it was removed rather than left in place giving false assurance. No
`X-RateLimit-*` headers are returned.

Please be reasonable: responses are cached at the edge, so hammering the same
query gains you nothing. If you need bulk access, open an issue and say what
you are building.

Rate limiting may return backed by a shared store. It will be announced in the
[CHANGELOG](CHANGELOG.md) before any limits are enforced.

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
