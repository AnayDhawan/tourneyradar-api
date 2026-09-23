/**
 * Typed client for the TourneyRadar API (issue #28).
 *
 * The API is keyless, and so is this client: `new TourneyRadar()` works. A key
 * only raises your rate limit, and passing one is a one-line change.
 *
 * Hand-written rather than generated. The surface is five endpoints, and a
 * generated client would ship a runtime, a build step and a thousand lines of
 * machinery to save writing the sixty below. It is small enough to read, which
 * matters more here than being mechanically derived.
 */

export type Category = 'Classical' | 'Rapid' | 'Blitz';

export type Tournament = {
  id: string;
  name: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  country_code?: string;
  lat?: number | null;
  lng?: number | null;
  category: Category;
  date: string;
  end_date?: string;
  fide_rated: boolean;
  time_control?: string;
  rounds?: number;
  organizer_name?: string;
  registration_link?: string | null;
  source_url?: string;
  status: string;
};

export type Page<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; hasMore: boolean };
};

export type ListOptions = {
  country?: string;
  category?: Category;
  upcoming?: boolean;
  fide_rated?: boolean;
  date_from?: string;
  date_to?: string;
  organizer?: string;
  limit?: number;
  page?: number;
};

export type CountryCount = { country_code: string; country: string; count: number };

export type Stats = {
  total: number;
  upcoming: number;
  countries: number;
  last_scraped: string | null;
  [key: string]: unknown;
};

export type Usage = {
  key: { name: string; tier: string };
  limit: { per_minute: number; description: string };
  usage: {
    today: number;
    last_30_days: number;
    days: Array<{ day: string; requests: number }>;
  };
};

export type ClientOptions = {
  /** Optional. Raises your rate limit; every data endpoint works without it. */
  apiKey?: string;
  /** Defaults to the hosted API. Point at a self-hosted instance if you run one. */
  baseUrl?: string;
  /** Passed through to fetch, so a caller can supply their own agent or polyfill. */
  fetch?: typeof globalThis.fetch;
};

const DEFAULT_BASE_URL = 'https://tourneyradar-api.vercel.app';

/**
 * Thrown for any non-2xx response.
 *
 * Carries the status and the API's own message rather than collapsing them
 * into one string, so a caller can branch on 429 without parsing prose. The
 * rate-limit fields are populated when the API sends them.
 */
export class TourneyRadarError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;
  readonly tier?: string;

  constructor(
    message: string,
    status: number,
    options: { retryAfterSeconds?: number; tier?: string } = {}
  ) {
    super(message);
    this.name = 'TourneyRadarError';
    this.status = status;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.tier = options.tier;
  }

  /** True when the request was refused for rate limiting rather than being wrong. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

export class TourneyRadar {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: ClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch;

    if (typeof this.fetchImpl !== 'function') {
      throw new Error(
        'No fetch available. Use Node 18+, or pass one as `fetch` in the options.'
      );
    }
  }

  private async request<T>(path: string, query: Record<string, unknown> = {}): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query)) {
      // An explicit `false` is meaningful (fide_rated=false), so only absent
      // values are dropped.
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

    const response = await this.fetchImpl(url.toString(), { headers });

    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after');
      let message = `${response.status} ${response.statusText}`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        // A non-JSON error body, such as a proxy's HTML. The status line is
        // still the useful part.
      }
      throw new TourneyRadarError(message, response.status, {
        retryAfterSeconds: retryAfter ? Number(retryAfter) : undefined,
        tier: response.headers.get('x-ratelimit-tier') ?? undefined,
      });
    }

    return (await response.json()) as T;
  }

  /** A page of tournaments. */
  list(options: ListOptions = {}): Promise<Page<Tournament>> {
    return this.request<Page<Tournament>>('/v1/tournaments', options);
  }

  /** One tournament by id. Throws a 404 error if it does not exist. */
  async get(id: string): Promise<Tournament> {
    const body = await this.request<{ data: Tournament }>(
      `/v1/tournaments/${encodeURIComponent(id)}`
    );
    return body.data;
  }

  /** Every country with tournaments, and how many each has. */
  async countries(): Promise<CountryCount[]> {
    const body = await this.request<{ data: CountryCount[] }>('/v1/countries');
    return body.data;
  }

  /** Full-text search over tournament names and locations. */
  search(query: string, options: { limit?: number } = {}): Promise<Page<Tournament>> {
    return this.request<Page<Tournament>>('/v1/search', { q: query, ...options });
  }

  /** Dataset-wide counts. */
  async stats(): Promise<Stats> {
    const body = await this.request<{ data: Stats }>('/v1/stats');
    return body.data;
  }

  /** Usage and ceiling for the configured key. Requires one. */
  usage(): Promise<Usage> {
    if (!this.apiKey) {
      return Promise.reject(
        new TourneyRadarError('usage() needs an API key. Pass one as `apiKey`.', 401)
      );
    }
    return this.request<Usage>('/v1/usage');
  }

  /**
   * Every tournament matching the filters, one page at a time.
   *
   * An async iterator rather than an array: the dataset is 14,000+ rows and
   * growing, and handing back one array invites loading all of it into memory
   * to look at the first ten. Pages are fetched as they are consumed, so
   * breaking out of the loop stops the requests.
   */
  async *paginate(options: ListOptions = {}): AsyncGenerator<Tournament, void, undefined> {
    let page = options.page ?? 1;

    for (;;) {
      const result = await this.list({ ...options, page });
      for (const tournament of result.data) yield tournament;
      if (!result.meta?.hasMore) return;
      page += 1;
    }
  }
}

export default TourneyRadar;
