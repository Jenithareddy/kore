---
inclusion: always
---

# Energy Intensities

All per-activity energy coefficients used by the Carbon Calculator. These values are the ground truth for all carbon computations in WattWise.

## Video Streaming — Data Rates

| Quality | Data Rate (GB/hr) | Source |
|---------|-------------------|--------|
| 480p    | 0.5               | Carbon Trust 2021 |
| 720p    | 1.5               | Carbon Trust 2021 |
| 1080p   | 3.0               | Carbon Trust 2021 |
| 4K      | 7.0               | Carbon Trust 2021 |

## Network Energy Intensity

| Connection Type | kWh/GB | Source |
|-----------------|--------|--------|
| Fixed-line (wifi/ethernet) | 0.077 | Carbon Trust 2021 |
| Cellular (4G)              | 0.21  | IEA 2022 |

**Formula:** `networkKWh = dataRateGB_per_hr × durationHours × energyPerGB`

## Device Power Draw

| Device        | Power (W) | Notes |
|---------------|-----------|-------|
| Laptop        | 30        | Mid-range, active use |
| Desktop       | 45        | Mid-range tower |
| Smartphone    | 3         | Active screen-on |
| TV (55" LCD)  | 95        | Active playback |

**Formula:** `deviceKWh = devicePowerW × durationHours / 1000`

## AI Prompts

| Parameter | Value | Source |
|-----------|-------|--------|
| Token estimation | 4 characters per token | Standard heuristic |
| Energy per 1,000 tokens | 0.3 Wh | Ren et al. 2023 |

**Formula:** `tokens = charCount / 4; energyWh = (tokens / 1000) × 0.3; networkKWh = energyWh / 1000`

## Video Calls

| Parameter | Value | Source |
|-----------|-------|--------|
| Energy per minute | 0.002 kWh/min | Obringer et al. 2021 |

**Formula:** `networkKWh = durationMinutes × 0.002`

## Page Loads

| Parameter | Value | Source |
|-----------|-------|--------|
| Baseline per page load | 1 gCO₂e | Sustainable Web Design model |

Page load uses a fixed baseline — not scaled by grid intensity.

## Global Average Grid Intensity

| Parameter | Value |
|-----------|-------|
| Global average | 475 gCO₂e/kWh |

Used as fallback when no region is configured or all grid APIs are unavailable.

## References

- Carbon Trust (2021). *Carbon impact of video streaming*
- IEA (2022). *Data Centres and Data Transmission Networks*
- Ren, X. et al. (2023). *Estimating the Carbon Footprint of Large Language Models*
- Obringer, R. et al. (2021). *The overlooked environmental footprint of increasing Internet use*
- Sustainable Web Design (2022). *Calculating Digital Emissions*
