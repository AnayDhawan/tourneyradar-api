# TourneyRadar API

A free, open-source REST API for over-the-board chess tournament data. 
No authentication required. No API key needed. This API currently serves 14,000+ tournaments in 70+ countries.
An optional key raises your rate limit; it never unlocks data. See [Rate limiting](#rate-limiting) and the [TypeScript client](clients/typescript).

**Base URL:** `https://tourneyradar-api.vercel.app`

**[Interactive docs](https://tourneyradar-api.vercel.app/docs)**: browse every endpoint and try requests against live data. Machine-readable spec at [`/openapi.json`](https://tourneyradar-api.vercel.app/openapi.json).

New here? **[Getting Started](GETTING_STARTED.md)** covers local setup, deployment, and a first call to every endpoint.

![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue)
![Status](https://img.shields.io/badge/status-live-brightgreen)

<p align="center">
  <img src="./docs/media/demo.gif" alt="TourneyRadar API Demo" width="900" />
</p>

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
    "total": 14603,
    "upcoming": 1390,
    "countries": 70,
    "byCategory": {
      "Classical": 3479,
      "Rapid": 7912,
      "Blitz": 1809
    },
    "lastScrapedAt": "2026-09-13T07:39:58.407+00:00"
  }
}
```

---

## Rate limiting

Backed by [Upstash Redis](https://upstash.com) rather than process memory, so
the limit actually holds across serverless invocations. This replaces an
earlier in-memory limiter that didn't
([#19](https://github.com/AnayDhawan/tourneyradar-api/issues/19)).

| Tier | Requests / minute | How to get it |
|---|---|---|
| `anonymous` | 100 | Nothing. This is the default and always will be. |
| `free` | 600 | Ask for a key. |
| `pro` | 6000 | Ask, and say what you are building. |

**A key raises your ceiling. It does not unlock data.** Every endpoint except
`/v1/usage` works exactly the same with or without one, and that will not
change: this is a public dataset.

Send it either way:

```bash
curl -H "Authorization: Bearer tr_live_..." https://tourneyradar-api.vercel.app/v1/stats
curl -H "X-API-Key: tr_live_..." https://tourneyradar-api.vercel.app/v1/stats
```

An unknown, revoked or malformed key is treated as no key rather than being
rejected, so a stale key degrades to the anonymous limit instead of breaking
your integration. It also means this API cannot be used to test whether a
stolen key is still live.

Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and
`X-RateLimit-Tier`. Once exceeded, requests get `429` with a `Retry-After`
header. If the Upstash store is unreachable, the API fails open: requests pass
through unlimited rather than the whole API going down.

Keyed requests are counted against the key rather than the address, so a team
behind one office IP does not compete with itself, and a key keeps its own
budget wherever it runs.

### Checking your usage

```bash
curl -H "Authorization: Bearer tr_live_..." https://tourneyradar-api.vercel.app/v1/usage
```

Returns daily counts for the last 30 days and the ceiling for your tier. It
reports your own key and has no parameter for looking at anyone else's.

### Keys are stored hashed

Only a SHA-256 of each key is stored, alongside a short display prefix. The
plaintext is shown once at issuance and cannot be recovered, so a lost key is
reissued rather than looked up, and a leak of the table hands over nothing
usable.

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

Using this API in your project? Open a PR adding a line to the table below,
or post in [Show and tell](https://github.com/AnayDhawan/tourneyradar-api/discussions/categories/show-and-tell)
if you'd rather not touch the README directly.

**Format:** `| [Project name](https://link) | One-line description | @your-github-handle |`

| Project | Description | Author |
|---|---|---|
| [TourneyRadar](https://github.com/AnayDhawan/tourneyradar) | Interactive world map of over-the-board chess tournaments, powered by this API | [@AnayDhawan](https://github.com/AnayDhawan) |

---

## Related

- [TourneyRadar](https://github.com/AnayDhawan/tourneyradar): the interactive
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

Apache-2.0. See [LICENSE](./LICENSE)

---
