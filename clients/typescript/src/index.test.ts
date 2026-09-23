import { describe, it, expect, vi } from 'vitest';
import { TourneyRadar, TourneyRadarError } from './index';

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init))
  ) as unknown as typeof globalThis.fetch;
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

const page = (data: unknown[], hasMore = false, pageNumber = 1) =>
  json({ data, meta: { page: pageNumber, limit: 50, total: data.length, hasMore } });

describe('construction', () => {
  it('works with no arguments at all, because the API is keyless', () => {
    expect(() => new TourneyRadar()).not.toThrow();
  });

  it('trims trailing slashes off a custom base URL', async () => {
    const fetchImpl = stubFetch(() => page([]));
    const client = new TourneyRadar({ baseUrl: 'http://localhost:3001/', fetch: fetchImpl });
    await client.list();

    // No client-side defaults in the query: the server owns what `limit`
    // means, and baking a copy in here is a second place for it to drift.
    expect(String((fetchImpl as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]))
      .toBe('http://localhost:3001/v1/tournaments');
  });
});

describe('authentication', () => {
  it('sends no Authorization header without a key', async () => {
    let seen: Record<string, string> = {};
    const fetchImpl = stubFetch((_url, init) => {
      seen = (init?.headers ?? {}) as Record<string, string>;
      return page([]);
    });

    await new TourneyRadar({ fetch: fetchImpl }).list();
    expect(seen.authorization).toBeUndefined();
  });

  it('sends the key as a bearer token when given one', async () => {
    let seen: Record<string, string> = {};
    const fetchImpl = stubFetch((_url, init) => {
      seen = (init?.headers ?? {}) as Record<string, string>;
      return page([]);
    });

    await new TourneyRadar({ apiKey: 'tr_live_abc', fetch: fetchImpl }).list();
    expect(seen.authorization).toBe('Bearer tr_live_abc');
  });

  it('rejects usage() without a key rather than making a doomed request', async () => {
    const fetchImpl = stubFetch(() => page([]));
    await expect(new TourneyRadar({ fetch: fetchImpl }).usage()).rejects.toThrow(TourneyRadarError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('query building', () => {
  it('passes filters through', async () => {
    let url = '';
    const fetchImpl = stubFetch((requested) => {
      url = requested;
      return page([]);
    });

    await new TourneyRadar({ fetch: fetchImpl }).list({
      country: 'IN',
      category: 'Classical',
      limit: 10,
    });

    expect(url).toContain('country=IN');
    expect(url).toContain('category=Classical');
    expect(url).toContain('limit=10');
  });

  it('keeps an explicit false, which is a real filter', async () => {
    let url = '';
    const fetchImpl = stubFetch((requested) => {
      url = requested;
      return page([]);
    });

    await new TourneyRadar({ fetch: fetchImpl }).list({ fide_rated: false });
    expect(url).toContain('fide_rated=false');
  });

  it('drops undefined options rather than sending the string "undefined"', async () => {
    let url = '';
    const fetchImpl = stubFetch((requested) => {
      url = requested;
      return page([]);
    });

    await new TourneyRadar({ fetch: fetchImpl }).list({ country: undefined });
    expect(url).not.toContain('country');
  });

  it('encodes an id with characters that would otherwise break the path', async () => {
    let url = '';
    const fetchImpl = stubFetch((requested) => {
      url = requested;
      return json({ data: { id: 'a/b' } });
    });

    await new TourneyRadar({ fetch: fetchImpl }).get('a/b');
    expect(url).toContain('a%2Fb');
  });
});

describe('unwrapping', () => {
  it('returns the tournament itself from get()', async () => {
    const fetchImpl = stubFetch(() => json({ data: { id: 'cr_1', name: 'Open' } }));
    const tournament = await new TourneyRadar({ fetch: fetchImpl }).get('cr_1');
    expect(tournament.id).toBe('cr_1');
  });

  it('returns the array itself from countries()', async () => {
    const fetchImpl = stubFetch(() => json({ data: [{ country_code: 'IN', country: 'India', count: 9 }] }));
    const countries = await new TourneyRadar({ fetch: fetchImpl }).countries();
    expect(countries[0]?.country_code).toBe('IN');
  });

  it('keeps the envelope on list(), because meta is the pagination', async () => {
    const fetchImpl = stubFetch(() => page([{ id: 'cr_1' }], true));
    const result = await new TourneyRadar({ fetch: fetchImpl }).list();
    expect(result.meta.hasMore).toBe(true);
    expect(result.data).toHaveLength(1);
  });
});

describe('errors', () => {
  it('throws the API message rather than the status line', async () => {
    const fetchImpl = stubFetch(() =>
      json({ error: 'Tournament not found', status: 404 }, { status: 404 })
    );

    await expect(new TourneyRadar({ fetch: fetchImpl }).get('nope')).rejects.toThrow(
      'Tournament not found'
    );
  });

  it('carries the status so a caller can branch without parsing prose', async () => {
    const fetchImpl = stubFetch(() => json({ error: 'Not found', status: 404 }, { status: 404 }));

    await new TourneyRadar({ fetch: fetchImpl }).get('nope').catch((err: TourneyRadarError) => {
      expect(err.status).toBe(404);
      expect(err.isRateLimited).toBe(false);
    });
    expect.assertions(2);
  });

  it('exposes retry-after and the tier on a 429', async () => {
    const fetchImpl = stubFetch(() =>
      json({ error: 'Too many requests', status: 429 }, {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': '30',
          'x-ratelimit-tier': 'anonymous',
        },
      })
    );

    await new TourneyRadar({ fetch: fetchImpl }).list().catch((err: TourneyRadarError) => {
      expect(err.isRateLimited).toBe(true);
      expect(err.retryAfterSeconds).toBe(30);
      expect(err.tier).toBe('anonymous');
    });
    expect.assertions(3);
  });

  it('survives an error body that is not JSON', async () => {
    const fetchImpl = stubFetch(
      () => new Response('<html>502 Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' })
    );

    await expect(new TourneyRadar({ fetch: fetchImpl }).list()).rejects.toThrow('502');
  });
});

describe('paginate', () => {
  it('walks every page and stops when hasMore goes false', async () => {
    let call = 0;
    const fetchImpl = stubFetch(() => {
      call += 1;
      return call === 1 ? page([{ id: 'a' }], true, 1) : page([{ id: 'b' }], false, 2);
    });

    const seen: string[] = [];
    for await (const tournament of new TourneyRadar({ fetch: fetchImpl }).paginate()) {
      seen.push(tournament.id);
    }

    expect(seen).toEqual(['a', 'b']);
    expect(call).toBe(2);
  });

  it('stops fetching when the caller breaks out', async () => {
    let call = 0;
    const fetchImpl = stubFetch(() => {
      call += 1;
      return page([{ id: `t${call}` }], true, call);
    });

    for await (const tournament of new TourneyRadar({ fetch: fetchImpl }).paginate()) {
      expect(tournament.id).toBe('t1');
      break;
    }

    // The point of the iterator: consuming one row must not pull the whole
    // 14,000-row dataset over the wire.
    expect(call).toBe(1);
  });
});
