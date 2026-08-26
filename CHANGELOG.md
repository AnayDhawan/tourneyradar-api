# Changelog

All notable changes to this project are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `/openapi.json`: OpenAPI 3.1 document generated from the same zod schemas the
  routes validate against, via `@hono/zod-openapi`. Covers all four routes,
  both response shapes, and every status code they can return. A test
  validates the served document with `@apidevtools/swagger-parser`
  ([#16](https://github.com/AnayDhawan/tourneyradar-api/issues/16)).
- `/v1/search` route for free-text tournament search ([#7](https://github.com/AnayDhawan/tourneyradar-api/pull/7)).
- `date_from`, `date_to`, and `organizer` filters on the tournaments endpoint
  ([#9](https://github.com/AnayDhawan/tourneyradar-api/pull/9)).
- CONTRIBUTING.md and CODE_OF_CONDUCT.md ([#8](https://github.com/AnayDhawan/tourneyradar-api/pull/8)).
- CI: build pipeline running typecheck, tests, and build on every push/PR to `main`;
  the repo previously had no `.github` directory and no automated checks at all
  ([#13](https://github.com/AnayDhawan/tourneyradar-api/issues/13)).
- 36 vitest tests across all four route handlers plus both zod schemas, run against a
  proxy-based Supabase mock so the suite needs no database or env vars
  ([#12](https://github.com/AnayDhawan/tourneyradar-api/issues/12)).
- `.env.example` documenting the three variables the code actually reads
  (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PORT`); CONTRIBUTING.md referenced it
  but it didn't exist, so setup failed at step one
  ([#11](https://github.com/AnayDhawan/tourneyradar-api/issues/11)).
- README contributors section: auto-updating avatar grid from the GitHub contributors
  graph.

### Fixed
- Country filter now validates 2-character ISO codes; previously accepted 3-character
  codes silently.
- CommonJS module type restored to match the `tsc` NodeNext CJS build output (was
  breaking the build).
- Tournament list `limit` cap raised from 100 to 1000.
- Removed a broken in-memory rate-limiting middleware that wasn't actually limiting
  anything.
- `GET /v1/tournaments/:id` passed the `:id` param straight to PostgREST with no
  validation, unlike the list and search routes; now constrained to the scraper's
  `cr_<id>` slug shape via zod
  ([#14](https://github.com/AnayDhawan/tourneyradar-api/issues/14)).

### Changed
- Relicensed from MIT to Apache-2.0.
- README expanded with tournament/country counts and fuller endpoint documentation,
  plus expanded quick-start API examples.
- README rate-limiting section corrected: it advertised 60 req/min/IP and
  `X-RateLimit-*` headers that were never sent after the limiter above was removed. Now
  states the real position (no limits today, responses edge-cached, future limits
  announced in the changelog first)
  ([#10](https://github.com/AnayDhawan/tourneyradar-api/issues/10)).
- `src/index.ts` split: the Hono app now lives in `src/app.ts` so tests can drive it
  via `app.request()` without starting a server; `index.ts` only binds the port.

## [2.0.0] - 2026-06-01

### Added
- README with full API documentation.

### Fixed
- ESM config corrected for Vercel deployment.
- Deployment bug fix.
- Removed a redundant CommonJS type declaration from `package.json`.

[2.0.0]: https://github.com/AnayDhawan/tourneyradar-api/releases/tag/v2
