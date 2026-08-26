# Security Policy

## Scope

This service holds a Supabase **service role key**, which bypasses row level
security entirely. Anything that could expose that key, or use it to read or
write data it shouldn't, is the highest-severity report possible against this
repository.

Also in scope:

- Injection through any query parameter (`country`, `category`, `q`, and so
  on) that reaches the Supabase/PostgREST query builder
- Anything that bypasses request validation (the zod schemas in
  `src/routes/*.ts`)
- Rate limit or CORS bypasses
- A dependency with a known CVE affecting this project

Out of scope:

- Reports against [chess-results.com](https://chess-results.com) or other
  third-party data sources this service scrapes from
- Theoretical issues without a proof of concept
- The absence of authentication itself: this API is deliberately public and
  keyless

## Reporting a vulnerability

**Do not open a public GitHub issue for a security report.**

Report privately through [GitHub Security
Advisories](https://github.com/AnayDhawan/tourneyradar-api/security/advisories/new).
This repository has private vulnerability reporting enabled, so no email
round-trip is needed.

Include steps to reproduce, the affected endpoint or file, and the potential
impact. A suggested fix is welcome but not required.

### Response timeline

| Stage | Target |
|-------|--------|
| Acknowledgement | Within 48 hours |
| Status update | Within 7 days |
| Patch or mitigation | Within 30 days for critical; 90 days for moderate |

## Supported versions

Only the latest release on `main` is supported. There are no maintained older
major versions.
