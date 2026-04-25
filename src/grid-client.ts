// Grid Client — fetch, cache, and fallback chain

// ─── Types ────────────────────────────────────────────────────────────────────

export type GridSource = 'electricitymaps' | 'eia' | 'static_fallback' | 'global_average'
export type GridConfidence = 'high' | 'medium' | 'low'

export interface GridIntensityResult {
  gCO2ePerKWh: number
  source: GridSource
  confidence: GridConfidence
  regionCode: string
  fetchedAt: number  // Unix ms, rounded to nearest hour
}

export interface HourlyForecast {
  hour: number           // 0 = current hour, 1 = next hour, etc.
  gCO2ePerKWh: number
  source: GridSource
  confidence: GridConfidence
}

interface GridCacheEntry {
  result: GridIntensityResult
  expiresAt: number  // fetchedAt + 15 * 60 * 1000
}

// ─── Static fallback table ────────────────────────────────────────────────────

const STATIC_FALLBACK_TABLE: Record<string, { name: string; hourly: number[] }> = {
  'US-CAL-CISO': { name: 'California ISO', hourly: [220,215,210,208,205,210,225,240,235,220,210,205,200,198,200,210,230,260,280,275,260,245,235,225] },
  'US-TEX-ERCO': { name: 'ERCOT (Texas)', hourly: [380,370,360,355,350,355,370,390,400,410,415,420,425,430,435,440,445,450,445,430,415,405,395,385] },
  'US-MIDA-PJM': { name: 'PJM Interconnection', hourly: [410,400,395,390,385,390,405,425,440,450,455,460,465,468,470,472,475,478,475,465,455,440,430,420] },
  'US-NE-ISNE':  { name: 'ISO New England', hourly: [290,280,275,270,268,272,285,300,315,325,330,335,338,340,342,345,348,350,345,335,320,310,300,295] },
  'US-NY-NYIS':  { name: 'New York ISO', hourly: [270,260,255,250,248,252,265,280,295,305,310,315,318,320,322,325,328,330,325,315,305,295,285,275] },
  'US-MIDW-MISO':{ name: 'MISO (Midwest)', hourly: [490,480,472,468,465,468,480,500,515,525,530,535,538,540,542,545,548,550,545,535,520,510,500,495] },
  'US-SW-AZPS':  { name: 'Arizona Public Service', hourly: [420,410,405,400,398,402,415,435,450,460,465,468,465,460,455,450,445,440,435,425,415,410,405,415] },
  'US-NW-BPAT':  { name: 'Bonneville Power (Pacific NW)', hourly: [80,78,76,75,74,75,80,90,100,108,112,115,118,120,122,125,128,130,125,115,105,95,88,82] },
  'US-SE-SOCO':  { name: 'Southern Company (SE)', hourly: [430,420,415,410,408,412,425,445,460,470,475,478,480,482,484,486,488,490,485,475,462,450,440,435] },
  'US-FLA-FPL':  { name: 'Florida Power & Light', hourly: [395,385,378,374,372,375,388,408,422,432,438,442,445,448,450,452,455,458,452,442,430,418,408,400] },
  'US-CENT-SPA': { name: 'Southwest Power Pool (Central)', hourly: [510,500,492,488,485,488,500,520,535,545,550,555,558,560,562,565,568,570,565,555,540,530,520,515] },
  'US-NW-PACW':  { name: 'PacifiCorp West', hourly: [350,340,335,330,328,332,345,365,380,390,395,398,400,402,404,406,408,410,405,395,382,370,360,355] },
  'US-MIDW-LGEE':{ name: 'LG&E and KU (Kentucky)', hourly: [560,548,540,535,532,535,548,568,582,592,598,602,605,608,610,612,615,618,612,602,588,575,565,560] },
  'US-TEN-TVA':  { name: 'Tennessee Valley Authority', hourly: [380,370,362,358,355,358,372,392,408,418,424,428,430,432,434,436,438,440,435,425,412,400,390,382] },
  'US-CAR-CPLE': { name: 'Duke Energy Carolinas', hourly: [400,390,382,378,375,378,392,412,428,438,444,448,450,452,454,456,458,460,455,445,432,420,410,402] },
  'US-NW-NEVP':  { name: 'NV Energy (Nevada)', hourly: [360,350,344,340,338,342,355,375,390,400,405,408,410,412,414,416,418,420,415,405,392,380,370,362] },
  'US-SW-WALC':  { name: 'Western Area Lower Colorado', hourly: [310,300,294,290,288,292,305,325,340,350,355,358,360,362,364,366,368,370,365,355,342,330,320,312] },
  'US-MIDW-EEI': { name: 'Ameren (Illinois/Missouri)', hourly: [480,470,462,458,455,458,470,490,505,515,520,524,526,528,530,532,534,536,530,520,506,494,484,478] },
  'US-SE-AEC':   { name: 'PowerSouth Energy (Alabama)', hourly: [445,435,428,424,422,425,438,458,472,482,488,492,494,496,498,500,502,504,498,488,475,462,452,446] },
  'US-NE-PSCO':  { name: 'Public Service Colorado', hourly: [440,430,422,418,415,418,430,450,465,475,480,484,486,488,490,492,494,496,490,480,466,454,444,440] },
}

export const GLOBAL_AVERAGE_INTENSITY = 475  // gCO2e/kWh
const CACHE_TTL_MS = 15 * 60 * 1000

// ─── In-memory cache ──────────────────────────────────────────────────────────

const cache = new Map<string, GridCacheEntry>()

function getCached(regionCode: string): GridIntensityResult | null {
  const entry = cache.get(regionCode)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(regionCode)
    return null
  }
  return entry.result
}

function setCached(regionCode: string, result: GridIntensityResult): void {
  cache.set(regionCode, { result, expiresAt: Date.now() + CACHE_TTL_MS })
}

/** Exposed for testing only — clears the in-memory cache */
export function _clearCacheForTesting(): void {
  cache.clear()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roundToNearestHour(ms: number): number {
  return Math.round(ms / (60 * 60 * 1000)) * (60 * 60 * 1000)
}

// ─── ElectricityMaps fetch ────────────────────────────────────────────────────
// Destination: api.electricitymap.org (allowlisted)
// Payload: zone (region code) + auth-token header only — no PII

async function fetchElectricityMaps(regionCode: string): Promise<GridIntensityResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)
  try {
    const apiKey = typeof process !== 'undefined' ? process.env.ELECTRICITY_MAPS_API_KEY : ''
    const response = await fetch(
      `https://api.electricitymap.org/v3/carbon-intensity/latest?zone=${encodeURIComponent(regionCode)}`,
      {
        signal: controller.signal,
        headers: { 'auth-token': apiKey ?? '' },
      }
    )
    if (!response.ok) throw new Error(`ElectricityMaps error: ${response.status}`)
    const data = await response.json() as { carbonIntensity: number }
    return {
      gCO2ePerKWh: data.carbonIntensity,
      source: 'electricitymaps',
      confidence: 'high',
      regionCode,
      fetchedAt: roundToNearestHour(Date.now()),
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

// ─── EIA fallback fetch ───────────────────────────────────────────────────────
// Destination: api.eia.gov (allowlisted)
// Payload: respondent code (derived from region code) + api_key only — no PII

async function fetchEIA(regionCode: string): Promise<GridIntensityResult> {
  // EIA API for US regions — uses the Hourly Grid Monitor
  // regionCode maps to EIA respondent codes (e.g. US-CAL-CISO → CISO)
  const eiaCode = regionCode.split('-').pop() ?? regionCode
  const response = await fetch(
    `https://api.eia.gov/v2/electricity/rto/region-data/data/?frequency=hourly&data[0]=value&facets[respondent][]=${eiaCode}&sort[0][column]=period&sort[0][direction]=desc&length=1`,
    { headers: { 'X-Params': JSON.stringify({ api_key: '' }) } }
  )
  if (!response.ok) throw new Error(`EIA error: ${response.status}`)
  const data = await response.json() as { response: { data: Array<{ value: number }> } }
  const value = data.response.data[0]?.value
  if (value == null) throw new Error('EIA: no data')
  return {
    gCO2ePerKWh: value,
    source: 'eia',
    confidence: 'medium',
    regionCode,
    fetchedAt: roundToNearestHour(Date.now()),
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the current grid carbon intensity for a region.
 * Fallback chain: ElectricityMaps → EIA → static table → global average.
 */
export async function getGridIntensity(
  regionCode: string | null | undefined,
): Promise<GridIntensityResult> {
  // No region configured → global average
  if (!regionCode) {
    return {
      gCO2ePerKWh: GLOBAL_AVERAGE_INTENSITY,
      source: 'global_average',
      confidence: 'low',
      regionCode: '',
      fetchedAt: roundToNearestHour(Date.now()),
    }
  }

  // Cache hit
  const cached = getCached(regionCode)
  if (cached) return cached

  // Try ElectricityMaps
  try {
    const result = await fetchElectricityMaps(regionCode)
    setCached(regionCode, result)
    return result
  } catch { /* fall through */ }

  // Try EIA
  try {
    const result = await fetchEIA(regionCode)
    setCached(regionCode, result)
    return result
  } catch { /* fall through */ }

  // Static fallback table
  const zone = STATIC_FALLBACK_TABLE[regionCode]
  if (zone) {
    const hour = new Date().getHours()
    const result: GridIntensityResult = {
      gCO2ePerKWh: zone.hourly[hour],
      source: 'static_fallback',
      confidence: 'low',
      regionCode,
      fetchedAt: roundToNearestHour(Date.now()),
    }
    setCached(regionCode, result)
    return result
  }

  // Global average last resort
  return {
    gCO2ePerKWh: GLOBAL_AVERAGE_INTENSITY,
    source: 'global_average',
    confidence: 'low',
    regionCode,
    fetchedAt: roundToNearestHour(Date.now()),
  }
}

/**
 * Get the hourly carbon intensity forecast for the next N hours.
 * Uses ElectricityMaps forecast endpoint if available; falls back to static table.
 * Destination: api.electricitymap.org (allowlisted) — payload: zone + auth-token only
 */
export async function getHourlyForecast(
  regionCode: string | null | undefined,
  hoursAhead: number = 24,
): Promise<HourlyForecast[]> {
  const forecasts: HourlyForecast[] = []
  const currentHour = new Date().getHours()

  // Try ElectricityMaps forecast endpoint
  if (regionCode) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      try {
        const apiKey = typeof process !== 'undefined' ? process.env.ELECTRICITY_MAPS_API_KEY : ''
        const response = await fetch(
          `https://api.electricitymap.org/v3/carbon-intensity/forecast?zone=${encodeURIComponent(regionCode)}`,
          { signal: controller.signal, headers: { 'auth-token': apiKey ?? '' } }
        )
        if (response.ok) {
          const data = await response.json() as { forecast: Array<{ carbonIntensity: number }> }
          return data.forecast.slice(0, hoursAhead).map((f, i) => ({
            hour: i,
            gCO2ePerKWh: f.carbonIntensity,
            source: 'electricitymaps' as GridSource,
            confidence: 'high' as GridConfidence,
          }))
        }
      } finally {
        clearTimeout(timeoutId)
      }
    } catch { /* fall through to static */ }
  }

  // Static table fallback — repeat hourly curve
  const zone = regionCode ? STATIC_FALLBACK_TABLE[regionCode] : null
  for (let i = 0; i < hoursAhead; i++) {
    const hour = (currentHour + i) % 24
    const intensity = zone ? zone.hourly[hour] : GLOBAL_AVERAGE_INTENSITY
    forecasts.push({
      hour: i,
      gCO2ePerKWh: intensity,
      source: zone ? 'static_fallback' : 'global_average',
      confidence: 'low',
    })
  }
  return forecasts
}
