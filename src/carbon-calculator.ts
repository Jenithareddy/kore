// Carbon Calculator — pure functions, no side effects, no I/O

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActivityType = 'video_streaming' | 'ai_prompt' | 'video_call' | 'page_load';
export type QualityTier = '480p' | '720p' | '1080p' | '4K';
export type DeviceType = 'laptop' | 'desktop' | 'smartphone' | 'tv';
export type ConnectionType = 'fixed' | 'cellular_4g';

export interface Activity {
  type: ActivityType;
  durationSeconds: number;
  quality?: QualityTier;
  deviceType: DeviceType;
  connectionType: ConnectionType;
  characterCount?: number;
  autoplay?: boolean;
}

export interface CarbonResult {
  gCO2e: number;
  energyKWh: number;
  breakdown: {
    networkKWh: number;
    deviceKWh: number;
  };
}

export interface QualityComparisonResult {
  tierA: { quality: QualityTier; gCO2e: number };
  tierB: { quality: QualityTier; gCO2e: number };
  percentageDifference: number; // positive = tierA costs more
}

export interface ComparisonAnchors {
  googleSearches: number;
  milesNotDriven: number;
  phoneCharges: number;
  kettlesBoiled: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Data rates in GB/hour (Carbon Trust 2021)
export const DATA_RATE_GB_PER_HR: Record<QualityTier, number> = {
  '480p': 0.5,
  '720p': 1.5,
  '1080p': 3.0,
  '4K': 7.0,
};

// Energy intensity in kWh/GB
export const ENERGY_PER_GB_KWH: Record<ConnectionType, number> = {
  fixed: 0.077,       // Carbon Trust 2021
  cellular_4g: 0.21, // IEA 2022
};

// Device power draw in Watts
export const DEVICE_POWER_W: Record<DeviceType, number> = {
  laptop: 30,
  desktop: 45,
  smartphone: 3,
  tv: 95,
};

// AI energy: 0.3 Wh per 1000 tokens (Ren et al. 2023)
export const AI_ENERGY_WH_PER_1K_TOKENS = 0.3;
export const AI_CHARS_PER_TOKEN = 4;

// Video call: 0.002 kWh/minute (Obringer et al. 2021)
export const VIDEO_CALL_KWH_PER_MINUTE = 0.002;

// Page load baseline
export const PAGE_LOAD_G_CO2E = 1;

// Comparison anchor constants
export const ANCHOR_GOOGLE_SEARCH_G = 0.2;
export const ANCHOR_MILE_NOT_DRIVEN_G = 404;
export const ANCHOR_PHONE_CHARGE_G = 8.22;
export const ANCHOR_KETTLE_BOILED_G = 50;

// Global average grid intensity (gCO2e/kWh)
export const GLOBAL_AVERAGE_GRID_INTENSITY = 475;

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Compute the carbon footprint of a digital activity.
 *
 * @param activity - The activity to compute carbon for
 * @param gridIntensityGCO2ePerKWh - Grid carbon intensity in gCO₂e/kWh
 * @returns CarbonResult with gCO2e, energyKWh, and breakdown
 */
export function computeCarbon(
  activity: Activity,
  gridIntensityGCO2ePerKWh: number,
): CarbonResult {
  const durationHours = activity.durationSeconds / 3600;

  if (activity.type === 'video_streaming') {
    const quality = activity.quality ?? '1080p';
    const networkKWh =
      DATA_RATE_GB_PER_HR[quality] *
      durationHours *
      ENERGY_PER_GB_KWH[activity.connectionType];
    const deviceKWh = (DEVICE_POWER_W[activity.deviceType] * durationHours) / 1000;
    const energyKWh = networkKWh + deviceKWh;
    const gCO2e = energyKWh * gridIntensityGCO2ePerKWh;
    return { gCO2e, energyKWh, breakdown: { networkKWh, deviceKWh } };
  }

  if (activity.type === 'ai_prompt') {
    const tokens = (activity.characterCount ?? 0) / AI_CHARS_PER_TOKEN;
    const energyWh = (tokens / 1000) * AI_ENERGY_WH_PER_1K_TOKENS;
    const networkKWh = energyWh / 1000;
    const deviceKWh = (DEVICE_POWER_W[activity.deviceType] * durationHours) / 1000;
    const energyKWh = networkKWh + deviceKWh;
    const gCO2e = energyKWh * gridIntensityGCO2ePerKWh;
    return { gCO2e, energyKWh, breakdown: { networkKWh, deviceKWh } };
  }

  if (activity.type === 'video_call') {
    const durationMinutes = activity.durationSeconds / 60;
    const networkKWh = durationMinutes * VIDEO_CALL_KWH_PER_MINUTE;
    const deviceKWh = (DEVICE_POWER_W[activity.deviceType] * durationHours) / 1000;
    const energyKWh = networkKWh + deviceKWh;
    const gCO2e = energyKWh * gridIntensityGCO2ePerKWh;
    return { gCO2e, energyKWh, breakdown: { networkKWh, deviceKWh } };
  }

  // page_load: fixed baseline, no grid intensity scaling per design
  const energyKWh = PAGE_LOAD_G_CO2E / gridIntensityGCO2ePerKWh;
  return {
    gCO2e: PAGE_LOAD_G_CO2E,
    energyKWh,
    breakdown: { networkKWh: energyKWh, deviceKWh: 0 },
  };
}

/**
 * Compare the carbon cost of two video quality tiers for the same activity.
 *
 * @param activity - Base activity (without quality)
 * @param tierA - First quality tier
 * @param tierB - Second quality tier
 * @param gridIntensityGCO2ePerKWh - Grid carbon intensity in gCO₂e/kWh
 * @returns QualityComparisonResult with both tier costs and percentage difference
 */
export function compareQualities(
  activity: Omit<Activity, 'quality'>,
  tierA: QualityTier,
  tierB: QualityTier,
  gridIntensityGCO2ePerKWh: number,
): QualityComparisonResult {
  const resultA = computeCarbon(
    { ...activity, type: 'video_streaming', quality: tierA },
    gridIntensityGCO2ePerKWh,
  );
  const resultB = computeCarbon(
    { ...activity, type: 'video_streaming', quality: tierB },
    gridIntensityGCO2ePerKWh,
  );
  const avg = (resultA.gCO2e + resultB.gCO2e) / 2;
  const percentageDifference = avg !== 0 ? ((resultA.gCO2e - resultB.gCO2e) / avg) * 100 : 0;
  return {
    tierA: { quality: tierA, gCO2e: resultA.gCO2e },
    tierB: { quality: tierB, gCO2e: resultB.gCO2e },
    percentageDifference,
  };
}

/**
 * Convert a gCO₂e value into relatable comparison anchors.
 *
 * @param gCO2e - Carbon value in grams CO₂ equivalent
 * @returns ComparisonAnchors with equivalent counts for each anchor
 */
export function toComparisonAnchors(gCO2e: number): ComparisonAnchors {
  return {
    googleSearches: gCO2e / ANCHOR_GOOGLE_SEARCH_G,
    milesNotDriven: gCO2e / ANCHOR_MILE_NOT_DRIVEN_G,
    phoneCharges: gCO2e / ANCHOR_PHONE_CHARGE_G,
    kettlesBoiled: gCO2e / ANCHOR_KETTLE_BOILED_G,
  };
}
