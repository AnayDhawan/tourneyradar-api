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
}

export function createQueryChain(result: MockResult) {
  const chain: Record<string, unknown> = {}

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        // Awaiting the chain resolves to the configured result.
        return (resolve: (value: MockResult) => unknown) => resolve(result)
      }
      return () => proxy
    },
  }

  const proxy = new Proxy(chain, handler)
  return proxy
}

export function createSupabaseMock(result: MockResult) {
  return { from: vi.fn(() => createQueryChain(result)) }
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
