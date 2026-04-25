# Spec: Carbon Calculator

## Inputs

```typescript
activity: {
  type: "video" | "ai_prompt" | "video_call" | "page_view" | "background_tab"
  platform: "youtube" | "netflix" | "claude" | "chatgpt" | "gemini" | "generic"
  duration_seconds: number
  quality?: "480p" | "720p" | "1080p" | "4K"
  data_bytes?: number
  device_type: "laptop" | "desktop" | "phone" | "tv"
  connection: "wifi" | "ethernet" | "cellular"
}
region: string        // ISO zone, e.g. "US-AZ-SRP"
timestamp: string     // ISO-8601
```

## Process

1. Look up energy intensity from `steering/energy_intensities.md`
2. Apply device & connection multipliers
3. Compute kWh
4. Fetch grid intensity (cached 15 min) via `grid_intensity_lookup.spec.md`
5. Multiply → gCO₂e
6. Append to activity_log (local IndexedDB)
7. Update rolling aggregates (1h, 24h, 7d, 30d)

## Output

```typescript
{
  session_g: number
  today_g: number
  week_g: number
  comparison: {
    campus_avg: number
    national_avg: number
  }
}
```

## Energy Model

See `steering/energy_intensities.md` for all coefficients with citations.

### Data rates (GB/hr)
| Quality | GB/hr |
|---------|-------|
| 480p    | 0.5   |
| 720p    | 1.5   |
| 1080p   | 3.0   |
| 4K      | 7.0   |

### Connection multipliers (kWh/GB)
| Connection | kWh/GB |
|------------|--------|
| wifi/ethernet (fixed) | 0.077 |
| cellular (4G)         | 0.21  |

### Device power draw (W)
| Device   | Watts |
|----------|-------|
| laptop   | 30    |
| desktop  | 45    |
| phone    | 3     |
| tv (55") | 95    |

## Correctness Properties

- Output `gCO₂e` is always ≥ 0 for any valid input
- Video streaming energy formula: `networkKWh = dataRate × durationHours × energyPerGB`
- Cellular/fixed ratio always equals `0.21 / 0.077 ≈ 2.727`
- Results within ±15% of IEA 2022 reference values at 475 gCO₂e/kWh
- `compareQualities(A, B).pct === -compareQualities(B, A).pct` (anti-symmetry)

## References

- Carbon Trust 2021 — data rate coefficients
- IEA 2022 — cellular energy intensity, streaming reference values
- Ren et al. 2023 — AI token energy (0.3 Wh / 1k tokens)
- Obringer et al. 2021 — video call energy (0.002 kWh/min)
- Sustainable Web Design model — page load baseline (1 gCO₂e)
