import { describe, it, expect, vi } from 'vitest'
import SwaggerParser from '@apidevtools/swagger-parser'
import { createSupabaseMock } from './test/supabase-mock'

vi.mock('./lib/supabase', () => ({
  get supabase() {
    return createSupabaseMock({ data: [], error: null, count: 0 })
  },
}))

import app from './app'

describe('GET /openapi.json', () => {
  it('serves a document that validates as OpenAPI 3.1', async () => {
    const res = await app.request('/openapi.json')
    expect(res.status).toBe(200)

    const doc = await res.json()
    expect(doc.openapi).toBe('3.1.0')

    // Throws if the document is not valid OpenAPI. This is the guard the
    // issue asked for: the doc is generated from the same zod schemas the
    // routes validate against, so it cannot drift the way a hand-written
    // spec would, but it can still be malformed.
    await expect(SwaggerParser.validate(structuredClone(doc))).resolves.toBeTruthy()
  })

  it('documents every route', async () => {
    const res = await app.request('/openapi.json')
    const doc = await res.json()

    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/v1/tournaments',
        '/v1/tournaments/{id}',
        '/v1/countries',
        '/v1/search',
      ])
    )
  })
})

describe('GET /docs', () => {
  it('renders the API reference pointed at /openapi.json', async () => {
    const res = await app.request('/docs')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')

    const body = await res.text()
    expect(body).toContain('/openapi.json')
  })
})

describe('app shell', () => {
  it('lists the docs and openapi urls', async () => {
    const res = await app.request('/')
    const body = await res.json()

    expect(body.docs).toBe('/docs')
    expect(body.openapi).toBe('/openapi.json')
  })
})
