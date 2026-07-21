# Changelog

All notable changes to this project are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `/v1/search` route for free-text tournament search ([#7](https://github.com/AnayDhawan/tourneyradar-api/pull/7)).
- `date_from`, `date_to`, and `organizer` filters on the tournaments endpoint
  ([#9](https://github.com/AnayDhawan/tourneyradar-api/pull/9)).
- CONTRIBUTING.md and CODE_OF_CONDUCT.md ([#8](https://github.com/AnayDhawan/tourneyradar-api/pull/8)).

### Fixed
- Country filter now validates 2-character ISO codes; previously accepted 3-character
  codes silently.
- CommonJS module type restored to match the `tsc` NodeNext CJS build output (was
  breaking the build).
- Tournament list `limit` cap raised from 100 to 1000.
- Removed a broken in-memory rate-limiting middleware that wasn't actually limiting
  anything.

### Changed
- Relicensed from MIT to Apache-2.0.
- README expanded with tournament/country counts and fuller endpoint documentation.

## [2.0.0] - 2026-06-01

### Added
- README with full API documentation.

### Fixed
- ESM config corrected for Vercel deployment.
- Deployment bug fix.
- Removed a redundant CommonJS type declaration from `package.json`.

[2.0.0]: https://github.com/AnayDhawan/tourneyradar-api/releases/tag/v2
