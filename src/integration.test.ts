// src/integration.test.ts — End-to-end integration and performance validation
// Task 12: All sub-tasks (12.1–12.7)

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  writeActivity,
  getActivitiesInWindow,
  recomputeAggregates,
  getAggregate,
  clearAllData,
  type ActivityRecord,
} from './db'
import { computeCarbon, type Activity } from './carbon-calculator'
import {
  isAllowlistedDomain,
  validateAllowlistedPayload,
  inspectPayload,
} from './ethics-gate/payload-inspector'
import { parseQualityLabel } from './content-scripts/shared'

beforeEach(async () => {
  await clearAllData()
})

// ─── 12.1 End-to-end integration tests for the full activity pipeline ─────────

describe('E2E: Full activity pipeline', () => {
  it('content script → carbon compute → write → aggregate update', async () => {
    const activity: Activity = {
      type: 'video_streaming',
      durationSeconds: 3600,
      quality: '1080p',
      deviceType: 'laptop',
      connectionType: 'fixed',
      autoplay: false,
    }
    const gridIntensity = 475
    const result = computeCarbon(activity, gridIntensity)

    const record: ActivityRecord = {
      type: 'video_streaming',
      platform: 'youtube',
      durationSeconds: 3600,
      qualityTier: '1080p',
      deviceType: 'laptop',
      connectionType: 'fixed',
      gCO2e: result.gCO2e,
      gridIntensityUsed: gridIntensity,
      gridIntensitySource: 'static_fallback',
      autoplay: false,
      timestamp: Date.now() - 1000,
    }

    await writeActivity(record)
    await recomputeAggregates()

    const agg = await getAggregate('1h')
    expect(agg).toBeDefined()
    expect(agg!.totalGCO2e).toBeCloseTo(result.gCO2e, 2)
    expect(agg!.videoUserGCO2e).toBeCloseTo(result.gCO2e, 2)
    expect(agg!.videoAutoplayGCO2e).toBe(0)
  })

  it('quality change mid-session produces two segments with different quality tiers', async () => {
    const now = Date.now()
    // Segment 1: 30 min at 4K (placed 40 min ago — well within the 1h window)
    const seg1 = computeCarbon({
      type: 'video_streaming', durationSeconds: 1800, quality: '4K',
      deviceType: 'laptop', connectionType: 'fixed', autoplay: false,
    }, 475)
    await writeActivity({
      type: 'video_streaming', platform: 'youtube', durationSeconds: 1800, qualityTier: '4K',
      deviceType: 'laptop', connectionType: 'fixed', gCO2e: seg1.gCO2e, gridIntensityUsed: 475,
      gridIntensitySource: 'static_fallback', autoplay: false, timestamp: now - 2400000,
    })
    // Segment 2: 30 min at 1080p (placed 10 min ago)
    const seg2 = computeCarbon({
      type: 'video_streaming', durationSeconds: 1800, quality: '1080p',
      deviceType: 'laptop', connectionType: 'fixed', autoplay: false,
    }, 475)
    await writeActivity({
      type: 'video_streaming', platform: 'youtube', durationSeconds: 1800, qualityTier: '1080p',
      deviceType: 'laptop', connectionType: 'fixed', gCO2e: seg2.gCO2e, gridIntensityUsed: 475,
      gridIntensitySource: 'static_fallback', autoplay: false, timestamp: now - 600000,
    })

    await recomputeAggregates()
    const agg = await getAggregate('1h')
    expect(agg!.totalGCO2e).toBeCloseTo(seg1.gCO2e + seg2.gCO2e, 2)
    // 4K segment should cost more
    expect(seg1.gCO2e).toBeGreaterThan(seg2.gCO2e)
  })

  it('autoplay records go to autoplay bucket only', async () => {
    const now = Date.now()
    const userResult = computeCarbon({
      type: 'video_streaming', durationSeconds: 600, quality: '1080p',
      deviceType: 'laptop', connectionType: 'fixed', autoplay: false,
    }, 475)
    const autoResult = computeCarbon({
      type: 'video_streaming', durationSeconds: 600, quality: '1080p',
      deviceType: 'laptop', connectionType: 'fixed', autoplay: true,
    }, 475)

    await writeActivity({
      type: 'video_streaming', platform: 'youtube', durationSeconds: 600, qualityTier: '1080p',
      deviceType: 'laptop', connectionType: 'fixed', gCO2e: userResult.gCO2e, gridIntensityUsed: 475,
      gridIntensitySource: 'static_fallback', autoplay: false, timestamp: now - 2000,
    })
    await writeActivity({
      type: 'video_streaming', platform: 'netflix', durationSeconds: 600, qualityTier: '1080p',
      deviceType: 'laptop', connectionType: 'fixed', gCO2e: autoResult.gCO2e, gridIntensityUsed: 475,
      gridIntensitySource: 'static_fallback', autoplay: true, timestamp: now - 1000,
    })

    await recomputeAggregates()
    const agg = await getAggregate('1h')
    expect(agg!.videoUserGCO2e).toBeCloseTo(userResult.gCO2e, 2)
    expect(agg!.videoAutoplayGCO2e).toBeCloseTo(autoResult.gCO2e, 2)
    expect(agg!.videoUserGCO2e + agg!.videoAutoplayGCO2e).toBeCloseTo(agg!.totalGCO2e, 2)
  })
})

// ─── 12.2 Privacy regression tests ───────────────────────────────────────────

describe('Privacy regression: no prohibited fields in ActivityRecord', () => {
  const PROHIBITED = ['url', 'pageTitle', 'tabId', 'promptText', 'ipAddress']

  it('video streaming record has no prohibited fields', async () => {
    const now = Date.now()
    await writeActivity({
      type: 'video_streaming', platform: 'youtube', durationSeconds: 60, qualityTier: '1080p',
      deviceType: 'laptop', connectionType: 'fixed', gCO2e: 2, gridIntensityUsed: 475,
      gridIntensitySource: 'electricitymaps', autoplay: false, timestamp: now - 500,
    })
    const records = await getActivitiesInWindow(now - 1000, now)
    for (const r of records) {
      for (const field of PROHIBITED) {
        expect(r).not.toHaveProperty(field)
      }
    }
  })

  it('AI prompt record has no prohibited fields', async () => {
    const now = Date.now()
    await writeActivity({
      type: 'ai_prompt', platform: 'chatgpt', durationSeconds: 5,
      deviceType: 'laptop', connectionType: 'fixed', gCO2e: 0.1, gridIntensityUsed: 475,
      gridIntensitySource: 'static_fallback', autoplay: false, timestamp: now - 500,
    })
    const records = await getActivitiesInWindow(now - 1000, now)
    for (const r of records) {
      for (const field of PROHIBITED) {
        expect(r).not.toHaveProperty(field)
      }
    }
  })
})

// ─── 12.3 Performance: content script init time ──────────────────────────────

describe('Performance: content script init time', () => {
  it('parseQualityLabel completes in < 1ms (proxy for init overhead)', () => {
    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      parseQualityLabel('1080p')
    }
    const elapsed = performance.now() - start
    // 1000 iterations should complete well under 50ms
    expect(elapsed).toBeLessThan(50)
  })
})

// ─── 12.4 Performance: service worker event processing ───────────────────────

describe('Performance: service worker event processing', () => {
  it('computeCarbon + writeActivity + recomputeAggregates completes in < 500ms', async () => {
    const start = performance.now()
    const result = computeCarbon({
      type: 'video_streaming', durationSeconds: 3600, quality: '1080p',
      deviceType: 'laptop', connectionType: 'fixed', autoplay: false,
    }, 475)
    await writeActivity({
      type: 'video_streaming', platform: 'youtube', durationSeconds: 3600, qualityTier: '1080p',
      deviceType: 'laptop', connectionType: 'fixed', gCO2e: result.gCO2e, gridIntensityUsed: 475,
      gridIntensitySource: 'static_fallback', autoplay: false, timestamp: Date.now() - 1000,
    })
    await recomputeAggregates()
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(500)
  })
})

// ─── 12.5 Performance: popup load (aggregate read) ───────────────────────────

describe('Performance: popup aggregate read time', () => {
  it('reading all four aggregates completes in < 500ms', async () => {
    // Seed some data so aggregates are non-empty
    const now = Date.now()
    for (let i = 0; i < 10; i++) {
      await writeActivity({
        type: 'video_streaming', platform: 'youtube', durationSeconds: 600, qualityTier: '1080p',
        deviceType: 'laptop', connectionType: 'fixed', gCO2e: 5 + i, gridIntensityUsed: 475,
        gridIntensitySource: 'static_fallback', autoplay: i % 3 === 0, timestamp: now - (i * 60000),
      })
    }
    await recomputeAggregates()

    const start = performance.now()
    const [h1, h24, d7, d30] = await Promise.all([
      getAggregate('1h'),
      getAggregate('24h'),
      getAggregate('7d'),
      getAggregate('30d'),
    ])
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(500)
    expect(h1).toBeDefined()
    expect(h24).toBeDefined()
    expect(d7).toBeDefined()
    expect(d30).toBeDefined()
  })
})

// ─── 12.6 Ethics Gate E2E ────────────────────────────────────────────────────

describe('Ethics Gate E2E', () => {
  it('grid client request URL is allowlisted', () => {
    expect(isAllowlistedDomain('https://api.electricitymap.org/v3/carbon-intensity/latest?zone=US-CAL-CISO')).toBe(true)
    expect(isAllowlistedDomain('https://api.eia.gov/v2/electricity/rto/region-data/data/')).toBe(true)
  })

  it('non-allowlisted domains are rejected', () => {
    expect(isAllowlistedDomain('https://evil.example.com/steal-data')).toBe(false)
    expect(isAllowlistedDomain('https://google.com')).toBe(false)
    expect(isAllowlistedDomain('https://youtube.com/watch?v=abc')).toBe(false)
  })

  it('grid client payload passes validation', () => {
    expect(validateAllowlistedPayload({ zone: 'US-CAL-CISO', timestamp: 3600000 })).toBe(true)
  })

  it('payload with activity data fails validation', () => {
    expect(validateAllowlistedPayload({ zone: 'US-CAL-CISO', activityLog: [] })).toBe(false)
  })

  it('payload with URL fails validation', () => {
    expect(validateAllowlistedPayload('https://youtube.com/watch?v=abc')).toBe(false)
  })

  it('payload inspector detects PII patterns', () => {
    const emailViolations = inspectPayload('user@example.com')
    expect(emailViolations.length).toBeGreaterThan(0)

    const ipViolations = inspectPayload('192.168.1.1')
    expect(ipViolations.length).toBeGreaterThan(0)

    // Clean payload should have no violations (just a region code)
    const cleanViolations = inspectPayload('US-CAL-CISO')
    expect(cleanViolations.length).toBe(0)
  })
})
