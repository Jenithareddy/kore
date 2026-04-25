import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  computeCarbon,
  compareQualities,
  toComparisonAnchors,
  DATA_RATE_GB_PER_HR,
  ENERGY_PER_GB_KWH,
  DEVICE_POWER_W,
  GLOBAL_AVERAGE_GRID_INTENSITY,
  PAGE_LOAD_G_CO2E,
  ANCHOR_MILE_NOT_DRIVEN_G,
  type Activity,
  type ActivityType,
  type QualityTier,
  type DeviceType,
  type ConnectionType,
} from './carbon-calculator';

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const activityTypeArb = fc.constantFrom<ActivityType>(
  'video_streaming',
  'ai_prompt',
  'video_call',
  'page_load',
);

const qualityTierArb = fc.constantFrom<QualityTier>('480p', '720p', '1080p', '4K');

const deviceTypeArb = fc.constantFrom<DeviceType>('laptop', 'desktop', 'smartphone', 'tv');

const connectionTypeArb = fc.constantFrom<ConnectionType>('fixed', 'cellular_4g');

/** Generate a valid Activity for any activity type */
const activityArb: fc.Arbitrary<Activity> = activityTypeArb.chain((type) => {
  const durationSecondsArb = fc.float({ min: 0, max: 7200, noNaN: true });

  if (type === 'video_streaming') {
    return fc.record({
      type: fc.constant(type),
      durationSeconds: durationSecondsArb,
      quality: qualityTierArb,
      deviceType: deviceTypeArb,
      connectionType: connectionTypeArb,
      autoplay: fc.boolean(),
    }) as fc.Arbitrary<Activity>;
  }

  if (type === 'ai_prompt') {
    return fc.record({
      type: fc.constant(type),
      durationSeconds: durationSecondsArb,
      deviceType: deviceTypeArb,
      connectionType: connectionTypeArb,
      characterCount: fc.integer({ min: 0, max: 100_000 }),
    }) as fc.Arbitrary<Activity>;
  }

  // video_call and page_load — no extra fields required
  return fc.record({
    type: fc.constant(type),
    durationSeconds: durationSecondsArb,
    deviceType: deviceTypeArb,
    connectionType: connectionTypeArb,
  }) as fc.Arbitrary<Activity>;
});

const gridIntensityArb = fc.float({ min: 0, max: 1000, noNaN: true });

// ─── Property 1: Carbon output is always non-negative ─────────────────────────
// Validates: Requirements 1.9

describe('Property 1: Carbon output is always non-negative', () => {
  it('computeCarbon().gCO2e >= 0 for all valid activities and non-negative grid intensity', () => {
    fc.assert(
      fc.property(activityArb, gridIntensityArb, (activity, gridIntensity) => {
        const result = computeCarbon(activity, gridIntensity);
        expect(result.gCO2e).toBeGreaterThanOrEqual(0);
        expect(result.energyKWh).toBeGreaterThanOrEqual(0);
        expect(result.breakdown.networkKWh).toBeGreaterThanOrEqual(0);
        expect(result.breakdown.deviceKWh).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});

// ─── Property 2: Video streaming energy formula correctness ───────────────────
// Validates: Requirements 1.2, 1.3

describe('Property 2: Video streaming energy formula correctness', () => {
  it('networkKWh matches the formula exactly for fixed-line connections', () => {
    fc.assert(
      fc.property(
        qualityTierArb,
        fc.float({ min: 0, max: 7200, noNaN: true }),
        deviceTypeArb,
        (quality, durationSeconds, deviceType) => {
          const activity: Activity = {
            type: 'video_streaming',
            durationSeconds,
            quality,
            deviceType,
            connectionType: 'fixed',
          };
          const result = computeCarbon(activity, GLOBAL_AVERAGE_GRID_INTENSITY);
          const durationHours = durationSeconds / 3600;
          const expectedNetworkKWh =
            DATA_RATE_GB_PER_HR[quality] * durationHours * ENERGY_PER_GB_KWH['fixed'];
          expect(result.breakdown.networkKWh).toBeCloseTo(expectedNetworkKWh, 10);
        },
      ),
    );
  });

  it('networkKWh matches the formula exactly for cellular connections', () => {
    fc.assert(
      fc.property(
        qualityTierArb,
        fc.float({ min: 0, max: 7200, noNaN: true }),
        deviceTypeArb,
        (quality, durationSeconds, deviceType) => {
          const activity: Activity = {
            type: 'video_streaming',
            durationSeconds,
            quality,
            deviceType,
            connectionType: 'cellular_4g',
          };
          const result = computeCarbon(activity, GLOBAL_AVERAGE_GRID_INTENSITY);
          const durationHours = durationSeconds / 3600;
          const expectedNetworkKWh =
            DATA_RATE_GB_PER_HR[quality] * durationHours * ENERGY_PER_GB_KWH['cellular_4g'];
          expect(result.breakdown.networkKWh).toBeCloseTo(expectedNetworkKWh, 10);
        },
      ),
    );
  });

  it('cellular/fixed ratio equals 0.21 / 0.077 within floating-point tolerance', () => {
    fc.assert(
      fc.property(
        qualityTierArb,
        // Use positive durations to avoid division by zero
        fc.float({ min: 1, max: 7200, noNaN: true }),
        deviceTypeArb,
        (quality, durationSeconds, deviceType) => {
          const baseActivity = { type: 'video_streaming' as const, durationSeconds, quality, deviceType };
          const fixedResult = computeCarbon(
            { ...baseActivity, connectionType: 'fixed' },
            GLOBAL_AVERAGE_GRID_INTENSITY,
          );
          const cellularResult = computeCarbon(
            { ...baseActivity, connectionType: 'cellular_4g' },
            GLOBAL_AVERAGE_GRID_INTENSITY,
          );

          // Only compare network portions (device energy is the same for both)
          if (fixedResult.breakdown.networkKWh > 0) {
            const ratio =
              cellularResult.breakdown.networkKWh / fixedResult.breakdown.networkKWh;
            const expectedRatio = ENERGY_PER_GB_KWH['cellular_4g'] / ENERGY_PER_GB_KWH['fixed'];
            expect(Math.abs(ratio - expectedRatio)).toBeLessThan(1e-10);
          }
        },
      ),
    );
  });
});

// ─── Property 3: IEA 2022 tolerance — streaming estimates within 15% ──────────
// Validates: Requirements 1.10

describe('Property 3: IEA 2022 tolerance — streaming estimates within 15%', () => {
  // Reference values: (dataRate * 0.077 + 0.030) * 475 for 1-hour laptop/fixed session
  const referenceValues: Record<QualityTier, number> = {
    '480p': (0.5 * 0.077 + 0.030) * 475,   // ≈ 32.6
    '720p': (1.5 * 0.077 + 0.030) * 475,   // ≈ 68.9
    '1080p': (3.0 * 0.077 + 0.030) * 475,  // ≈ 124.1
    '4K': (7.0 * 0.077 + 0.030) * 475,     // ≈ 270.9
  };

  const qualityTiers: QualityTier[] = ['480p', '720p', '1080p', '4K'];

  for (const quality of qualityTiers) {
    it(`${quality} is within ±15% of IEA 2022 reference value`, () => {
      const activity: Activity = {
        type: 'video_streaming',
        durationSeconds: 3600, // 1 hour
        quality,
        deviceType: 'laptop',
        connectionType: 'fixed',
      };
      const result = computeCarbon(activity, GLOBAL_AVERAGE_GRID_INTENSITY);
      const reference = referenceValues[quality];
      const tolerance = 0.15;
      expect(result.gCO2e).toBeGreaterThanOrEqual(reference * (1 - tolerance));
      expect(result.gCO2e).toBeLessThanOrEqual(reference * (1 + tolerance));
    });
  }
});

// ─── Property 4: Quality comparison anti-symmetry ─────────────────────────────
// Validates: Requirements 1.8

describe('Property 4: Quality comparison anti-symmetry', () => {
  it('compareQualities(A,B).percentageDifference === -compareQualities(B,A).percentageDifference', () => {
    fc.assert(
      fc.property(
        qualityTierArb,
        qualityTierArb,
        fc.float({ min: 1, max: 7200, noNaN: true }),
        deviceTypeArb,
        connectionTypeArb,
        // Use a meaningful minimum grid intensity to avoid floating-point instability near zero
        fc.float({ min: 1, max: 1000, noNaN: true }),
        (tierA, tierB, durationSeconds, deviceType, connectionType, gridIntensity) => {
          const baseActivity = {
            type: 'video_streaming' as const,
            durationSeconds,
            deviceType,
            connectionType,
          };

          const ab = compareQualities(baseActivity, tierA, tierB, gridIntensity);
          const ba = compareQualities(baseActivity, tierB, tierA, gridIntensity);

          // Both individual gCO2e values must be non-negative
          expect(ab.tierA.gCO2e).toBeGreaterThanOrEqual(0);
          expect(ab.tierB.gCO2e).toBeGreaterThanOrEqual(0);
          expect(ba.tierA.gCO2e).toBeGreaterThanOrEqual(0);
          expect(ba.tierB.gCO2e).toBeGreaterThanOrEqual(0);

          // Anti-symmetry: percentageDifference(A,B) === -percentageDifference(B,A)
          // i.e., ab.percentageDifference + ba.percentageDifference ≈ 0
          const abPct = ab.percentageDifference;
          const baPct = ba.percentageDifference;
          const magnitude = Math.max(Math.abs(abPct), Math.abs(baPct), 1e-9);
          const relativeError = Math.abs(abPct + baPct) / magnitude;
          expect(relativeError).toBeLessThan(1e-9);
        },
      ),
    );
  });
});

// ─── Property 5: Comparison anchors are non-negative and finite ───────────────
// Validates: Requirements 12.3

describe('Property 5: Comparison anchors are non-negative and finite', () => {
  it('all anchors are >= 0 and finite for any non-negative gCO2e input', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1_000_000, noNaN: true }),
        (gCO2e) => {
          const anchors = toComparisonAnchors(gCO2e);
          expect(anchors.googleSearches).toBeGreaterThanOrEqual(0);
          expect(anchors.milesNotDriven).toBeGreaterThanOrEqual(0);
          expect(anchors.phoneCharges).toBeGreaterThanOrEqual(0);
          expect(anchors.kettlesBoiled).toBeGreaterThanOrEqual(0);
          expect(isFinite(anchors.googleSearches)).toBe(true);
          expect(isFinite(anchors.milesNotDriven)).toBe(true);
          expect(isFinite(anchors.phoneCharges)).toBe(true);
          expect(isFinite(anchors.kettlesBoiled)).toBe(true);
        },
      ),
    );
  });
});

// ─── Example-based unit tests ─────────────────────────────────────────────────

describe('computeCarbon — example-based unit tests', () => {
  it('1-hour 1080p video on laptop/fixed at 475 gCO2e/kWh', () => {
    const activity: Activity = {
      type: 'video_streaming',
      durationSeconds: 3600,
      quality: '1080p',
      deviceType: 'laptop',
      connectionType: 'fixed',
    };
    const result = computeCarbon(activity, 475);
    // networkKWh = 3.0 * 1 * 0.077 = 0.231
    // deviceKWh  = 30 * 1 / 1000   = 0.030
    // energyKWh  = 0.261
    // gCO2e      = 0.261 * 475     = 123.975
    expect(result.breakdown.networkKWh).toBeCloseTo(0.231, 6);
    expect(result.breakdown.deviceKWh).toBeCloseTo(0.030, 6);
    expect(result.energyKWh).toBeCloseTo(0.261, 6);
    expect(result.gCO2e).toBeCloseTo(123.975, 3);
  });

  it('AI prompt with 400 characters on laptop/fixed at 475 gCO2e/kWh', () => {
    const activity: Activity = {
      type: 'ai_prompt',
      durationSeconds: 5,
      characterCount: 400,
      deviceType: 'laptop',
      connectionType: 'fixed',
    };
    const result = computeCarbon(activity, 475);
    // tokens = 400 / 4 = 100
    // energyWh = (100 / 1000) * 0.3 = 0.03 Wh
    // networkKWh = 0.03 / 1000 = 0.00003
    // deviceKWh = 30 * (5/3600) / 1000 ≈ 0.0000416...
    // gCO2e = (networkKWh + deviceKWh) * 475
    const tokens = 400 / 4;
    const energyWh = (tokens / 1000) * 0.3;
    const networkKWh = energyWh / 1000;
    const deviceKWh = (30 * (5 / 3600)) / 1000;
    const expectedGCO2e = (networkKWh + deviceKWh) * 475;
    expect(result.gCO2e).toBeCloseTo(expectedGCO2e, 6);
    expect(result.breakdown.networkKWh).toBeCloseTo(networkKWh, 10);
  });

  it('page_load returns PAGE_LOAD_G_CO2E baseline regardless of grid intensity', () => {
    const activity: Activity = {
      type: 'page_load',
      durationSeconds: 2,
      deviceType: 'laptop',
      connectionType: 'fixed',
    };
    expect(computeCarbon(activity, 475).gCO2e).toBe(PAGE_LOAD_G_CO2E);
    expect(computeCarbon(activity, 200).gCO2e).toBe(PAGE_LOAD_G_CO2E);
  });

  it('video_call energy scales with duration', () => {
    const activity: Activity = {
      type: 'video_call',
      durationSeconds: 3600, // 60 minutes
      deviceType: 'laptop',
      connectionType: 'fixed',
    };
    const result = computeCarbon(activity, 475);
    // networkKWh = 60 * 0.002 = 0.12
    // deviceKWh  = 30 * 1 / 1000 = 0.030
    expect(result.breakdown.networkKWh).toBeCloseTo(0.12, 6);
    expect(result.breakdown.deviceKWh).toBeCloseTo(0.030, 6);
  });
});

describe('compareQualities — example-based unit tests', () => {
  it('4K vs 1080p returns positive percentage difference (4K costs more)', () => {
    const baseActivity = {
      type: 'video_streaming' as const,
      durationSeconds: 3600,
      deviceType: 'laptop' as DeviceType,
      connectionType: 'fixed' as ConnectionType,
    };
    const result = compareQualities(baseActivity, '4K', '1080p', 475);
    // 4K gCO2e  = (7.0 * 0.077 + 0.030) * 475 ≈ 270.9
    // 1080p gCO2e = (3.0 * 0.077 + 0.030) * 475 ≈ 124.0
    // avg = (270.9 + 124.0) / 2 ≈ 197.4
    // pct = (270.9 - 124.0) / 197.4 * 100 ≈ 74.4%
    expect(result.tierA.quality).toBe('4K');
    expect(result.tierB.quality).toBe('1080p');
    expect(result.tierA.gCO2e).toBeGreaterThan(result.tierB.gCO2e);
    expect(result.percentageDifference).toBeGreaterThan(0);
    // Anti-symmetry check: compareQualities(4K, 1080p) = -compareQualities(1080p, 4K)
    const reversed = compareQualities(baseActivity, '1080p', '4K', 475);
    const magnitude = Math.max(Math.abs(result.percentageDifference), Math.abs(reversed.percentageDifference), 1e-9);
    expect(Math.abs(result.percentageDifference + reversed.percentageDifference) / magnitude).toBeLessThan(1e-9);
  });
});

describe('toComparisonAnchors — example-based unit tests', () => {
  it('toComparisonAnchors(404) returns milesNotDriven === 1', () => {
    const anchors = toComparisonAnchors(ANCHOR_MILE_NOT_DRIVEN_G);
    expect(anchors.milesNotDriven).toBeCloseTo(1, 10);
  });

  it('toComparisonAnchors(0) returns all zeros', () => {
    const anchors = toComparisonAnchors(0);
    expect(anchors.googleSearches).toBe(0);
    expect(anchors.milesNotDriven).toBe(0);
    expect(anchors.phoneCharges).toBe(0);
    expect(anchors.kettlesBoiled).toBe(0);
  });

  it('toComparisonAnchors(0.2) returns googleSearches === 1', () => {
    const anchors = toComparisonAnchors(0.2);
    expect(anchors.googleSearches).toBeCloseTo(1, 10);
  });
});
