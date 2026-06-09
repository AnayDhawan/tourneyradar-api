# Contributing

Thanks for your interest in tourneyradar-api.

---

## Setup

```bash
git clone https://github.com/AnayDhawan/tourneyradar-api.git
cd tourneyradar-api
npm install
cp .env.example .env
npm run dev
```

You will need a Supabase project. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

---

## Running locally

```bash
npm run dev   # start server on localhost:3000
npm run build # type-check and compile
```

All endpoints are available at `http://localhost:3000/v1/`.

---

## Project structure

```
routes/         # Express route handlers (one file per resource)
lib/            # Shared helpers (supabase client, validators, types)
scripts/        # One-off scripts (not part of the API)
```

---

## Adding a new endpoint

1. Create or edit a file in `routes/`.
2. Register the route in the main server file.
3. Follow the existing pagination envelope — responses use `{ data, meta }`.
4. Use the shared Supabase client from `lib/supabase.ts`.
5. Validate query params before passing to Supabase — no raw user input in filters.

---

## Good first contributions

- Add a missing query param to an existing endpoint (see open issues)
- Improve error messages to return consistent JSON shapes
- Add JSDoc comments to route handlers
- Fix a data quality issue in the tournament records

---

## Code style

- Strict TypeScript — all code must pass `npm run build`
- No `any` — use `unknown` and narrow, or define a proper interface
- No hardcoded secrets — all values via environment variables
- No `console.log` in `routes/` or `lib/` — use the logger if one exists, or omit

---

## Commit format

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>
```

Common types:

| Type | When to use |
|------|-------------|
| `feat:` | New endpoint or capability |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `refactor:` | Code change with no behaviour change |
| `chore:` | Tooling, deps, config |

Examples:
```
feat: add date-range filter to /v1/tournaments
fix: return 400 on invalid country code
docs: add setup instructions to CONTRIBUTING.md
```

---

## PR guidelines

- One PR per change — keep scope tight
- Reference the issue your PR closes: `Closes #N`
- Mark as draft until the work is complete and tested
- AI-assisted PRs are welcome, provided you have reviewed and tested the output
