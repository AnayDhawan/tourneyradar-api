# Getting Started

Two audiences, two sections: **using the hosted API** (skip straight to
[Usage](#usage), no setup needed) and **self-hosting or contributing** (start
at [Local setup](#local-setup)).

---

## Local setup

```bash
git clone https://github.com/AnayDhawan/tourneyradar-api.git
cd tourneyradar-api
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Required | What it is |
|---|---|---|
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key, from Project Settings → API. Bypasses row level security, so it is server-side only. Never expose it through a browser-reachable route or commit it. |
| `PORT` | No | Defaults to `3001` |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | No | Only if you want rate limiting locally. See [Rate limiting](README.md#rate-limiting). Without these, rate limiting is a no-op. |

```bash
npm run dev
```

The API is now at `http://localhost:3001`. `npm run dev` uses `tsx watch`, so
it restarts on save, and reads `.env.local` directly, no separate `dotenv`
setup needed.

Other useful commands:

```bash
npm test        # vitest, runs against a Supabase mock, no real database needed
npm run typecheck
npm run build    # tsc, outputs to dist/
```

---

## Deployment

This deploys as a single Vercel serverless function. `vercel.json` routes
every request to `dist/index.js`:

```json
{
  "routes": [{ "src": "/(.*)", "dest": "dist/index.js" }]
}
```

The build command is `npm run build` (`tsc`, no bundler), output directory
`dist`. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as Vercel
environment variables; add the two `UPSTASH_REDIS_REST_*` variables as well if
you want rate limiting enforced in production.

If you're self-hosting elsewhere, `npm run build && npm start` runs the same
compiled output behind `@hono/node-server` instead.

---

## Usage

No account, no API key. Every example below works as-is.

**List tournaments**, with filters:
```bash
curl "https://tourneyradar-api.vercel.app/v1/tournaments?country=IN&upcoming=true&limit=5"
```
Other filters: `category` (`Classical`/`Rapid`/`Blitz`), `fide_rated`,
`date_from`/`date_to` (ISO dates), `organizer`, `page`.

**A single tournament:**
```bash
curl "https://tourneyradar-api.vercel.app/v1/tournaments/cr_1371843"
```

**Countries with tournament data:**
```bash
curl "https://tourneyradar-api.vercel.app/v1/countries"
```

**Full-text search:**
```bash
curl "https://tourneyradar-api.vercel.app/v1/search?q=open&limit=2"
```

**Aggregate stats** (total tournaments, upcoming count, countries, count by
category, last scrape time):
```bash
curl "https://tourneyradar-api.vercel.app/v1/stats"
```

### The response envelope

Paginated routes (`/v1/tournaments`, `/v1/search`) return:
```json
{
  "data": [ /* ... */ ],
  "meta": { "page": 1, "limit": 50, "total": 248, "hasMore": true }
}
```

Single-resource routes (`/v1/tournaments/:id`, `/v1/countries`, `/v1/stats`)
return just `{ "data": ... }`, no `meta`.

Errors are always `{ "error": "...", "status": <code> }` at that same status
code.

### Cache headers

Every route sets `Cache-Control: public, s-maxage=3600,
stale-while-revalidate=86400` and an `ETag`. Send `If-None-Match` with a
previous ETag to get a `304` with no body instead of re-downloading data that
hasn't changed. See [README § Rate limiting](README.md#rate-limiting) for the
current limits.

### Explore interactively

- **[`/docs`](https://tourneyradar-api.vercel.app/docs)**: try every endpoint
  in the browser against live data.
- **[`/openapi.json`](https://tourneyradar-api.vercel.app/openapi.json)**:
  the machine-readable spec, if you're generating a client.

---

## What's not here yet

No authentication or API keys today; this is a deliberately keyless public
API. That will likely change once API keys, tiered limits, and an SDK land
(tracked in [#28](https://github.com/AnayDhawan/tourneyradar-api/issues/28)),
at which point this guide gets a rewrite rather than a patch.
