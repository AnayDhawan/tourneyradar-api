import { vi } from 'vitest'

/**
 * The routes chain PostgREST builder calls (.select().eq().order().range() and
 * so on) and only await the final object. This returns a proxy where every
 * unknown method hands back the same object, so any chain shape resolves to
 * one controlled result.
 */
export interface MockResult {
  data: unknown
  error: unknown
  count?: number
  /**
   * Rows per page for paged selects. When set, a chain that called
   * .range(from, to) resolves to the page at from / (to - from + 1) instead of
   * `data`, and to an empty page past the end.
   */
  pages?: unknown[][]
}

export interface QueryCall {
  method: string
  args: unknown[]
}

export function createQueryChain(result: MockResult, calls: QueryCall[] = []) {
  const chain: Record<string, unknown> = {}

  let range: [number, number] | null = null

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        // Awaiting the chain resolves to the configured result.
        return (resolve: (value: MockResult) => unknown) => {
          if (result.pages && range) {
            const index = range[0] / (range[1] - range[0] + 1)
            return resolve({ ...result, data: result.pages[index] ?? [] })
          }
          return resolve(result)
        }
      }
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args })
        if (prop === 'range') range = [args[0] as number, args[1] as number]
        return proxy
      }
    },
  }

  const proxy = new Proxy(chain, handler)
  return proxy
}

export function createSupabaseMock(result: MockResult, calls: QueryCall[] = []) {
  return { from: vi.fn(() => createQueryChain(result, calls)) }
}

export const sampleTournament = {
  id: 'cr_123456',
  name: 'Mumbai Open 2027',
  location: 'Mumbai, India',
  city: 'Mumbai',
  state: 'Maharashtra',
  country: 'India',
  country_code: 'IN',
  lat: 19.076,
  lng: 72.8777,
  category: 'Classical',
  date: '2027-01-15',
  end_date: '2027-01-20',
  fide_rated: true,
  time_control: '90+30',
  rounds: 9,
  organizer_name: 'Mumbai Chess Association',
  registration_link: null,
  source_url: 'https://chess-results.com/tnr123456.aspx',
  status: 'published',
}
