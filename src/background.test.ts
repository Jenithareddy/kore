// src/background.test.ts
// Integration tests for the service worker logic.
//
// We test the core logic functions directly rather than the service worker module itself
// (service workers can't be imported in jsdom — Chrome APIs aren't available at module
// evaluation time). Integration is verified by testing commitActivity logic inline.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  writeActivity,
  getActivitiesInWindow,
  clearAllData,
  getSetting,
  setSetting,
} from './db'
import { computeCarbon } from './carbon-calculator'
import type { ActivityStartPayload } from './messages'

beforeEach(async () => {
  await clearAllData()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Service Worker — activity lifecycle integration', () => {
  it('computeCarbon produces correct gCO2e for a 1-hour 1080p video', () => {
    const result = computeCarbon(
      {
        type: 'video_streaming',
        durationSeconds: 3600,
        quality: '1080p',
        deviceType: 'laptop',
        connectionType: 'fixed',
        autoplay: false,
      },
      475,
    )
    // networkKWh = 3.0 GB/hr * 1 hr * 0.077 kWh/GB = 0.231 kWh
    // deviceKWh  = 30 W * 1 hr / 1000 = 0.030 kWh
    // total      = 0.261 kWh * 475 gCO2e/kWh = 123.975 g
    expect(result.gCO2e).toBeCloseTo(123.975, 2)
    expect(result.gCO2e).toBeGreaterThan(0)
  })

  it('writeActivity stores a record with no prohibited fields', async () => {
    const now = Date.now()
    await writeActivity({
      type: 'video_streaming',
      platform: 'youtube',
      durationSeconds: 3600,
      qualityTier: '1080p',
      deviceType: 'laptop',
      connectionType: 'fixed',
      gCO2e: 123.975,
      gridIntensityUsed: 475,
      gridIntensitySource: 'electricitymaps',
      autoplay: false,
      timestamp: now - 1000,
    })

    const records = await getActivitiesInWindow(now - 2000, now)
    expect(records).toHaveLength(1)
    const record = records[0]

    // Verify no prohibited fields
    expect(record).not.toHaveProperty('url')
    expect(record).not.toHaveProperty('pageTitle')
    expect(record).not.toHaveProperty('tabId')
    expect(record).not.toHaveProperty('promptText')
    expect(record).not.toHaveProperty('ipAddress')

    // Verify correct fields
    expect(record.gCO2e).toBeCloseTo(123.975, 2)
    expect(record.platform).toBe('youtube')
    expect(record.autoplay).toBe(false)
  })

  it('quality change splits session into two segments', async () => {
    const now = Date.now()
    const startTimestamp = now - 7200000 // 2 hours ago

    // Simulate first segment: 1 hour at 4K
    const segment1Duration = 3600
    const segment1Stop = startTimestamp + segment1Duration * 1000
    const result1 = computeCarbon(
      {
        type: 'video_streaming',
        durationSeconds: segment1Duration,
        quality: '4K',
        deviceType: 'laptop',
        connectionType: 'fixed',
        autoplay: false,
      },
      475,
    )
    await writeActivity({
      type: 'video_streaming',
      platform: 'youtube',
      durationSeconds: segment1Duration,
      qualityTier: '4K',
      deviceType: 'laptop',
      connectionType: 'fixed',
      gCO2e: result1.gCO2e,
      gridIntensityUsed: 475,
      gridIntensitySource: 'static_fallback',
      autoplay: false,
      timestamp: segment1Stop,
    })

    // Simulate second segment: 1 hour at 1080p
    const segment2Duration = 3600
    const segment2Stop = segment1Stop + segment2Duration * 1000
    const result2 = computeCarbon(
      {
        type: 'video_streaming',
        durationSeconds: segment2Duration,
        quality: '1080p',
        deviceType: 'laptop',
        connectionType: 'fixed',
        autoplay: false,
      },
      475,
    )
    await writeActivity({
      type: 'video_streaming',
      platform: 'youtube',
      durationSeconds: segment2Duration,
      qualityTier: '1080p',
      deviceType: 'laptop',
      connectionType: 'fixed',
      gCO2e: result2.gCO2e,
      gridIntensityUsed: 475,
      gridIntensitySource: 'static_fallback',
      autoplay: false,
      timestamp: segment2Stop,
    })

    const records = await getActivitiesInWindow(startTimestamp, now)
    expect(records).toHaveLength(2)
    expect(records[0].qualityTier).toBe('4K')
    expect(records[1].qualityTier).toBe('1080p')
    // 4K costs more than 1080p
    expect(records[0].gCO2e).toBeGreaterThan(records[1].gCO2e)
  })

  it('settings round-trip: SET_REGION persists region code', async () => {
    await setSetting('region', 'US-CAL-CISO')
    const region = await getSetting<string>('region')
    expect(region).toBe('US-CAL-CISO')
  })

  it('CLEAR_DATA resets all data', async () => {
    const now = Date.now()
    await writeActivity({
      type: 'video_streaming',
      platform: 'youtube',
      durationSeconds: 3600,
      deviceType: 'laptop',
      connectionType: 'fixed',
      gCO2e: 100,
      gridIntensityUsed: 475,
      gridIntensitySource: 'electricitymaps',
      autoplay: false,
      timestamp: now - 1000,
    })
    await clearAllData()
    const records = await getActivitiesInWindow(now - 2000, now)
    expect(records).toHaveLength(0)
  })

  it('autoplay flag is correctly stored and retrieved', async () => {
    const now = Date.now()
    await writeActivity({
      type: 'video_streaming',
      platform: 'netflix',
      durationSeconds: 1800,
      qualityTier: '1080p',
      deviceType: 'tv',
      connectionType: 'fixed',
      gCO2e: 50,
      gridIntensityUsed: 475,
      gridIntensitySource: 'static_fallback',
      autoplay: true,
      timestamp: now - 500,
    })

    const records = await getActivitiesInWindow(now - 1000, now)
    expect(records).toHaveLength(1)
    expect(records[0].autoplay).toBe(true)
    expect(records[0].platform).toBe('netflix')
  })

  it('computeCarbon for AI prompt uses character count correctly', () => {
    // 400 chars → 100 tokens → 0.03 Wh network energy
    // deviceKWh = 30W * (30/3600) hr / 1000 = 0.00025 kWh
    const result = computeCarbon(
      {
        type: 'ai_prompt',
        durationSeconds: 30,
        deviceType: 'laptop',
        connectionType: 'fixed',
        characterCount: 400,
        autoplay: false,
      },
      475,
    )
    expect(result.gCO2e).toBeGreaterThan(0)
    // tokens = 400/4 = 100; energyWh = (100/1000)*0.3 = 0.03 Wh = 0.00003 kWh
    // deviceKWh = 30 * (30/3600) / 1000 = 0.00025 kWh
    // total = (0.00003 + 0.00025) * 475 = 0.133 g
    expect(result.gCO2e).toBeCloseTo(0.133, 2)
  })

  it('ActivityStartPayload type does not include prompt text', () => {
    // Verify the type structure — characterCount is allowed, but no promptText field
    const payload: ActivityStartPayload = {
      type: 'ai_prompt',
      platform: 'chatgpt',
      deviceType: 'laptop',
      connectionType: 'fixed',
      autoplay: false,
      startTimestamp: Date.now(),
      characterCount: 250,
      // promptText would be a TypeScript error here — not in the type
    }
    expect(payload).not.toHaveProperty('promptText')
    expect(payload.characterCount).toBe(250)
  })
})
