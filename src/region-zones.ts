// src/region-zones.ts
export interface RegionZone {
  code: string
  name: string
  state: string
}

export const REGION_ZONES: RegionZone[] = [
  { code: 'US-CAL-CISO', name: 'California ISO', state: 'California' },
  { code: 'US-TEX-ERCO', name: 'ERCOT', state: 'Texas' },
  { code: 'US-MIDA-PJM', name: 'PJM Interconnection', state: 'Mid-Atlantic' },
  { code: 'US-NE-ISNE', name: 'ISO New England', state: 'New England' },
  { code: 'US-NY-NYIS', name: 'New York ISO', state: 'New York' },
  { code: 'US-MIDW-MISO', name: 'MISO', state: 'Midwest' },
  { code: 'US-SW-AZPS', name: 'Arizona Public Service', state: 'Arizona' },
  { code: 'US-NW-BPAT', name: 'Bonneville Power', state: 'Pacific Northwest' },
  { code: 'US-SE-SOCO', name: 'Southern Company', state: 'Southeast' },
  { code: 'US-FLA-FPL', name: 'Florida Power & Light', state: 'Florida' },
  { code: 'US-CENT-SPA', name: 'Southwest Power Pool', state: 'Central US' },
  { code: 'US-NW-PACW', name: 'PacifiCorp West', state: 'Pacific Northwest' },
  { code: 'US-MIDW-LGEE', name: 'LG&E and KU', state: 'Kentucky' },
  { code: 'US-TEN-TVA', name: 'Tennessee Valley Authority', state: 'Tennessee' },
  { code: 'US-CAR-CPLE', name: 'Duke Energy Carolinas', state: 'Carolinas' },
  { code: 'US-NW-NEVP', name: 'NV Energy', state: 'Nevada' },
  { code: 'US-SW-WALC', name: 'Western Area Lower Colorado', state: 'Southwest' },
  { code: 'US-MIDW-EEI', name: 'Ameren', state: 'Illinois/Missouri' },
  { code: 'US-SE-AEC', name: 'PowerSouth Energy', state: 'Alabama' },
  { code: 'US-NE-PSCO', name: 'Public Service Colorado', state: 'Colorado' },
]

/** Find a zone by code */
export function getZoneByCode(code: string): RegionZone | undefined {
  return REGION_ZONES.find(z => z.code === code)
}

/** Filter zones by search text (matches name, state, or code) */
export function filterZones(search: string): RegionZone[] {
  const s = search.toLowerCase().trim()
  if (!s) return REGION_ZONES
  return REGION_ZONES.filter(z =>
    z.name.toLowerCase().includes(s) ||
    z.state.toLowerCase().includes(s) ||
    z.code.toLowerCase().includes(s)
  )
}
