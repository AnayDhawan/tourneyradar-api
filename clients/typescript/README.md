# tourneyradar

Typed TypeScript client for the [TourneyRadar API](https://github.com/AnayDhawan/tourneyradar-api):
over-the-board chess tournaments across 70+ countries.

```bash
npm install tourneyradar
```

## Use it

No key needed. The API is keyless.

```ts
import { TourneyRadar } from 'tourneyradar';

const chess = new TourneyRadar();

const { data, meta } = await chess.list({ country: 'IN', upcoming: true });
console.log(`${meta.total} tournaments, showing ${data.length}`);
```

## With a key

A key raises your rate limit from 100 to 600 requests a minute. Every endpoint
works without one.

```ts
const chess = new TourneyRadar({ apiKey: process.env.TOURNEYRADAR_KEY });
const { usage, limit } = await chess.usage();
console.log(`${usage.today} requests today, ceiling ${limit.per_minute}/min`);
```

## Methods

| Method | Returns |
|---|---|
| `list(options?)` | A page of tournaments, with `meta` for pagination |
| `get(id)` | One tournament |
| `search(query, options?)` | A page of search results |
| `countries()` | Every country with tournaments, and how many |
| `stats()` | Dataset-wide counts |
| `usage()` | Your key's usage and ceiling. Needs a key. |
| `paginate(options?)` | An async iterator over every match |

`list` and `paginate` take `country`, `category`, `upcoming`, `fide_rated`,
`date_from`, `date_to`, `organizer`, `limit` and `page`.

## Paginating

`paginate` fetches pages as you consume them, so breaking out of the loop stops
the requests. The dataset is 14,000+ rows; this exists so you do not pull all of
it to look at the first ten.

```ts
for await (const tournament of chess.paginate({ country: 'DE' })) {
  if (tournament.fide_rated) console.log(tournament.name);
}
```

## Errors

Any non-2xx throws a `TourneyRadarError` carrying the status, so you can branch
without parsing the message.

```ts
import { TourneyRadarError } from 'tourneyradar';

try {
  await chess.get('nope');
} catch (err) {
  if (err instanceof TourneyRadarError) {
    if (err.status === 404) console.log('No such tournament');
    if (err.isRateLimited) console.log(`Retry in ${err.retryAfterSeconds}s`);
  }
}
```

## Options

| Option | Default | Notes |
|---|---|---|
| `apiKey` | none | Raises your rate limit. Optional. |
| `baseUrl` | the hosted API | Point at a self-hosted instance. |
| `fetch` | global `fetch` | Supply your own on Node below 18. |

Apache-2.0.
