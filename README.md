
# TourneyRadar API

A free, open-source REST API for chess tournament data worldwide. No authentication required.

**Base URL:** `https://tourneyradar-api.vercel.app`

![License: MIT](https://img.shields.io/badge/license-MIT-blue)
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
    "total": 847,
    "hasMore": true
  }
}
```

---

### GET /v1/tournaments/:id

Returns a single tournament by ID.

**Example:**
GET /v1/tournaments/cr_1371843

---

### GET /v1/countries

Returns all countries with tournament data.

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

## Rate limiting

60 requests per minute per IP. Responses include:
- `X-RateLimit-Limit` — your limit
- `X-RateLimit-Remaining` — requests left in current window

---

## Quick start

```js
// Get upcoming tournaments in India
const res = await fetch(
  'https://tourneyradar-api.vercel.app/v1/tournaments?country=IN&upcoming=true'
)
const { data, meta } = await res.json()
console.log(`Found ${meta.total} upcoming tournaments in India`)
```

```python
import requests

res = requests.get(
  'https://tourneyradar-api.vercel.app/v1/tournaments',
  params={'country': 'DE', 'upcoming': 'true', 'limit': 10}
)
data = res.json()
```

---

## Data source

Tournament data is scraped weekly from [Chess-Results.com](https://chess-results.com) 
and geocoded via Google Maps. Currently covers 23 countries with 1,900+ tournaments.

---

## Built with this API

> Using this API in your project? Open a PR to add it here.

---

## Related

- [TourneyRadar](https://github.com/AnayDhawan/tourneyradar) — the interactive 
  map that uses this API

---

## License

MIT
