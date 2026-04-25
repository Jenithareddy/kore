# Spec: Grid Intensity Lookup

## Inputs

```typescript
region: string     // ISO zone, e.g. "US-AZ-SRP"
timestamp: string  // ISO-8601, rounded to nearest hour before use
```

## Cache

- TTL: 15 minutes per region
- Key: `regionCode`
- Storage: in-memory Map in service worker (rebuilt on restart)
- At most one outbound API call per region per 15-minute window

## Fallback Chain

### Primary — ElectricityMaps
- Endpoint: `GET /v3/carbon-intensity/latest?zone={region}`
- Host: `api.electricitymap.org`
- Confidence: `high`
- Timeout: 5 seconds; throw on non-2xx

### Secondary — EIA Hourly Grid Monitor
- US regions only
- Host: `api.eia.gov`
- Confidence: `medium`
- Throw on failure

### Tertiary — Static fallback table
- Bundled JSON: `steering/grid_fallback_table.md`
- Pre-computed hourly curves for top 20 US grid zones
- Confidence: `low`

### Last resort — Global average
- Value: 475 gCO₂e/kWh
- Used when no region is configured or all sources fail
- Confidence: `low`
- Triggers one-time setup prompt in popup

## Output

```typescript
{
  gCO2e_per_kWh: number
  source: "electricitymaps" | "eia" | "static_fallback" | "global_average"
  confidence: "high" | "medium" | "low"
  region: string
  fetched_at: string  // ISO-8601, rounded to nearest hour
}
```

## Privacy Rules

- Payload sent to APIs contains ONLY: `zone` (region code) + `auth-token`
- Timestamp rounded to nearest hour — never finer granularity
- No GPS coordinates, IP addresses, URLs, or page titles ever sent
- Enforced by Ethics Gate (`ethics_gate.spec.md`)

## Hourly Forecast (for Scheduler Nudge)

- Returns array of 24 `HourlyForecast` objects (hours 0–23 ahead)
- Uses ElectricityMaps forecast endpoint when available
- Falls back to repeating current intensity for all hours when only static/global data available
- Used by `scheduler_nudge.spec.md` to find lowest-carbon window
