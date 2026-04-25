/**
 * Grid Client tests — fetch, cache, and fallback chain.
 *
 * All fetch calls are mocked via vi.stubGlobal / vi.fn() — no real network calls.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'

import {
  getGridIntensity,
  getHourlyForecast,
  _clearCacheForTesting,
  GLOBAL_AVERAGE_INTENSITY,
  type GridSource,
  type GridConfidence,
} from './grid-client'

// ─── Test isolation ───────────────────────────────────────────────────────────

beforeEach(() => {
  _clearCacheForTesting()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function mockEmSuccess(carbonIntensity: number) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ carbonIntensity }),
  })
}

function mockEiaSuccess(value: number) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ response: { data: [{ value }] } }),
  })
}

function mockFetchFail() {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({}),
  })
}

// ─── Example-based tests ──────────────────────────────────────────────────────

describe('getGridIntensity — ElectricityMaps success path', () => {
  it('returns source: electricitymaps and confidence: high', async () => {
    vi.stubGlobal('fetch', mockEmSuccess(320))
    const result = await getGridIntensity('US-CAL-CISO')
    expect(result.source).toBe('electricitymaps')
    expect(result.confidence).toBe('high')
    expect(result.gCO2ePerKWh).toBe(320)
    expect(result.regionCode).toBe('US-CAL-CISO')
  })

  it('fetchedAt is rounded to the nearest hour', async () => {
    vi.stubGlobal('fetch', mockEmSuccess(300))
    const before = Date.now()
    const result = await getGridIntensity('US-CAL-CISO')
    const after = Date.now()
    // fetchedAt must be a multiple of 1 hour in ms
    expect(result.fetchedAt % (60 * 60 * 1000)).toBe(0)
    // Must be within ±1 hour of now
    expect(result.fetchedAt).toBeGreaterThanOrEqual(before - 60 * 60 * 1000)
    expect(result.fetchedAt).toBeLessThanOrEqual(after + 60 * 60 * 1000)
  })
})

describe('getGridIntensity — EIA fallback when EM fails', () => {
  it('returns source: eia and confidence: medium when EM fails', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: [{ value: 410 }] } }),
      })
    vi.stubGlobal('fetch', mockFetch)

    const result = await getGridIntensity('US-MIDA-PJM')
    expect(result.source).toBe('eia')
    expect(result.confidence).toBe('medium')
    expect(result.gCO2ePerKWh).toBe(410)
  })
})

describe('getGridIntensity — static fallback when both APIs fail', () => {
  it('returns source: static_fallback and confidence: low for a known zone', async () => {
    vi.stubGlobal('fetch', mockFetchFail())
    const result = await getGridIntensity('US-CAL-CISO')
    expect(result.source).toBe('static_fallback')
    expect(result.confidence).toBe('low')
    // Value must be one of the 24 hourly values for CISO
    const cisoHourly = [220,215,210,208,205,210,225,240,235,220,210,205,200,198,200,210,230,260,280,275,260,245,235,225]
    expect(cisoHourly).toContain(result.gCO2ePerKWh)
  })
})

describe('getGridIntensity — global average when no region configured', () => {
  it('returns gCO2ePerKWh: 475 and confidence: low for null region', async () => {
    const result = await getGridIntensity(null)
    expect(result.gCO2ePerKWh).toBe(GLOBAL_AVERAGE_INTENSITY)
    expect(result.confidence).toBe('low')
    expect(result.source).toBe('global_average')
    expect(result.regionCode).toBe('')
  })

  it('returns gCO2ePerKWh: 475 and confidence: low for undefined region', async () => {
    const result = await getGridIntensity(undefined)
    expect(result.gCO2ePerKWh).toBe(GLOBAL_AVERAGE_INTENSITY)
    expect(result.source).toBe('global_average')
  })

  it('returns gCO2ePerKWh: 475 and confidence: low for empty string region', async () => {
    const result = await getGridIntensity('')
    expect(result.gCO2ePerKWh).toBe(GLOBAL_AVERAGE_INTENSITY)
    expect(result.source).toBe('global_average')
  })
})

describe('getGridIntensity — global average when region not in static table', () => {
  it('returns gCO2ePerKWh: 475 when region is unknown and both APIs fail', async () => {
    vi.stubGlobal('fetch', mockFetchFail())
    const result = await getGridIntensity('XX-UNKNOWN-ZONE')
    expect(result.gCO2ePerKWh).toBe(GLOBAL_AVERAGE_INTENSITY)
    expect(result.source).toBe('global_average')
    expect(result.confidence).toBe('low')
  })
})

describe('getGridIntensity — cache TTL expiry', () => {
  it('calls fetch again after the 15-minute TTL expires', async () => {
    vi.useFakeTimers()
    const mockFetch = mockEmSuccess(300)
    vi.stubGlobal('fetch', mockFetch)

    // First call — populates cache
    await getGridIntensity('US-TEX-ERCO')
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Advance time past the 15-minute TTL
    vi.advanceTimersByTime(15 * 60 * 1000 + 1)

    // Second call — cache expired, should fetch again
    await getGridIntensity('US-TEX-ERCO')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

describe('getGridIntensity — cache hit within TTL', () => {
  it('does not call fetch a second time within the TTL', async () => {
    const mockFetch = mockEmSuccess(350)
    vi.stubGlobal('fetch', mockFetch)

    const result1 = await getGridIntensity('US-NW-BPAT')
    const result2 = await getGridIntensity('US-NW-BPAT')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(result1.gCO2ePerKWh).toBe(result2.gCO2ePerKWh)
  })
})

// ─── getHourlyForecast tests ──────────────────────────────────────────────────

describe('getHourlyForecast — static fallback returns 24 entries', () => {
  it('returns exactly 24 HourlyForecast entries when static fallback is used', async () => {
    vi.stubGlobal('fetch', mockFetchFail())
    const forecasts = await getHourlyForecast('US-CAL-CISO', 24)
    expect(forecasts).toHaveLength(24)
    for (let i = 0; i < 24; i++) {
      expect(forecasts[i].hour).toBe(i)
      expect(forecasts[i].source).toBe('static_fallback')
      expect(forecasts[i].confidence).toBe('low')
      expect(typeof forecasts[i].gCO2ePerKWh).toBe('number')
    }
  })

  it('returns global_average source when no region and static fallback used', async () => {
    const forecasts = await getHourlyForecast(null, 24)
    expect(forecasts).toHaveLength(24)
    for (const f of forecasts) {
      expect(f.source).toBe('global_average')
      expect(f.gCO2ePerKWh).toBe(GLOBAL_AVERAGE_INTENSITY)
    }
  })

  it('respects hoursAhead parameter', async () => {
    vi.stubGlobal('fetch', mockFetchFail())
    const forecasts = await getHourlyForecast('US-CAL-CISO', 6)
    expect(forecasts).toHaveLength(6)
  })
})

describe('getHourlyForecast — ElectricityMaps forecast success', () => {
  it('returns electricitymaps source and high confidence when EM forecast succeeds', async () => {
    const forecastData = Array.from({ length: 24 }, (_, i) => ({ carbonIntensity: 200 + i }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ forecast: forecastData }),
    }))

    const forecasts = await getHourlyForecast('US-CAL-CISO', 24)
    expect(forecasts).toHaveLength(24)
    expect(forecasts[0].source).toBe('electricitymaps')
    expect(forecasts[0].confidence).toBe('high')
    expect(forecasts[0].gCO2ePerKWh).toBe(200)
    expect(forecasts[23].gCO2ePerKWh).toBe(223)
  })
})

// ─── Property 6: Cache prevents redundant network calls ──────────────────────
// Validates: Requirements 2.4

describe('Property 6: Grid client cache prevents redundant network calls', () => {
  it(
    'fetch is called exactly once for two calls within TTL; both return same gCO2ePerKWh',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate valid-looking region codes (non-empty strings)
          fc.string({ minLength: 3, maxLength: 20 }).filter(s => s.trim().length > 0),
          // Generate positive intensity values
          fc.float({ min: 1, max: 1000, noNaN: true }),
          async (regionCode, intensity) => {
            _clearCacheForTesting()

            const mockFetch = mockEmSuccess(intensity)
            vi.stubGlobal('fetch', mockFetch)

            const result1 = await getGridIntensity(regionCode)
            const result2 = await getGridIntensity(regionCode)

            // fetch called exactly once — cache served the second call
            expect(mockFetch).toHaveBeenCalledTimes(1)
            // Both calls return the same intensity
            expect(result1.gCO2ePerKWh).toBe(result2.gCO2ePerKWh)

            vi.unstubAllGlobals()
          },
        ),
        { numRuns: 20 },
      )
    },
  )
})

// ─── Property 7: Source and confidence fields always present ──────────────────
// Validates: Requirements 2.5

const VALID_SOURCES: GridSource[] = ['electricitymaps', 'eia', 'static_fallback', 'global_average']
const VALID_CONFIDENCES: GridConfidence[] = ['high', 'medium', 'low']

describe('Property 7: Grid intensity response always includes source and confidence', () => {
  it('ElectricityMaps success: source and confidence are valid', async () => {
    vi.stubGlobal('fetch', mockEmSuccess(300))
    const result = await getGridIntensity('US-CAL-CISO')
    expect(VALID_SOURCES).toContain(result.source)
    expect(VALID_CONFIDENCES).toContain(result.confidence)
  })

  it('EIA fallback: source and confidence are valid', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: [{ value: 400 }] } }),
      })
    vi.stubGlobal('fetch', mockFetch)
    const result = await getGridIntensity('US-MIDA-PJM')
    expect(VALID_SOURCES).toContain(result.source)
    expect(VALID_CONFIDENCES).toContain(result.confidence)
  })

  it('static fallback: source and confidence are valid', async () => {
    vi.stubGlobal('fetch', mockFetchFail())
    const result = await getGridIntensity('US-CAL-CISO')
    expect(VALID_SOURCES).toContain(result.source)
    expect(VALID_CONFIDENCES).toContain(result.confidence)
  })

  it('global average (no region): source and confidence are valid', async () => {
    const result = await getGridIntensity(null)
    expect(VALID_SOURCES).toContain(result.source)
    expect(VALID_CONFIDENCES).toContain(result.confidence)
  })

  it(
    'property-based: every result has valid source and confidence across all fallback levels',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // 0 = EM success, 1 = EM fail + EIA success, 2 = both fail (static), 3 = no region
          fc.integer({ min: 0, max: 3 }),
          async (scenario) => {
            _clearCacheForTesting()

            let result
            if (scenario === 0) {
              vi.stubGlobal('fetch', mockEmSuccess(300))
              result = await getGridIntensity('US-CAL-CISO')
            } else if (scenario === 1) {
              const mockFetch = vi.fn()
                .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
                .mockResolvedValueOnce({
                  ok: true,
                  json: async () => ({ response: { data: [{ value: 400 }] } }),
                })
              vi.stubGlobal('fetch', mockFetch)
              result = await getGridIntensity('US-MIDA-PJM')
            } else if (scenario === 2) {
              vi.stubGlobal('fetch', mockFetchFail())
              result = await getGridIntensity('US-CAL-CISO')
            } else {
              result = await getGridIntensity(null)
            }

            expect(VALID_SOURCES).toContain(result.source)
            expect(VALID_CONFIDENCES).toContain(result.confidence)
            expect(typeof result.gCO2ePerKWh).toBe('number')
            expect(result.gCO2ePerKWh).toBeGreaterThanOrEqual(0)

            vi.unstubAllGlobals()
          },
        ),
        { numRuns: 40 },
      )
    },
  )
})
