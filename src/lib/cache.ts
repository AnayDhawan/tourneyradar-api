import { createHash } from 'node:crypto'

// All four routes read from tables that refresh on a weekly scrape, so there
// is no reason for the routes to disagree about how long a response stays
// fresh. One hour of edge freshness plus a generous stale-while-revalidate
// window keeps responses fast without ever risking staleness anywhere close
// to the real update cadence.
export const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400'

export function etagFor(body: unknown): string {
  return `"${createHash('sha1').update(JSON.stringify(body)).digest('base64url')}"`
}
