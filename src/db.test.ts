/**
 * IndexedDB Store tests — Dexie schema, read/write, purge, and aggregate consistency.
 *
 * Uses fake-indexeddb to run Dexie in Node/jsdom without a real browser.
 */
import 'fake-indexeddb/auto'

import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'

import {
  db,
  writeActivity,
  getActivitiesInWindow,
  getAggregate,
  recomputeAggregates,
  purgeOldActivities,
  getSetting,
  setSetting,
  clearAllData,
  type ActivityRecord,
  type AggregateKey,
} from './db'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal valid ActivityRecord (no prohibited fields). */
function makeActivity(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    type: 'video_streaming',
    platform: 'youtube',
    durationSeconds: 3600,
    deviceType: 'laptop',
    connectionType: 'fixed',
    gCO2e: 10,
    gridIntensityUsed: 475,
    gridIntensitySource: 'electricitymaps',
    autoplay: false,
    // Default to slightly in the past so recomputeAggregates always includes them
    timestamp: Date.now() - 1000,
    ...overrides,
  }
}

// ─── Test isolation ───────────────────────────────────────────────────────────

beforeEach(async () => {
  await clearAllData()
})

// ─── Example-based tests ──────────────────────────────────────────────────────

describe('writeActivity + getActivitiesInWindow round-trip', () => {
  it('writes a record and reads it back within the time window', async () => {
    const now = Date.now()
    const record = makeActivity({ timestamp: now - 500, gCO2e: 42 })
    const id = await writeActivity(record)
    expect(typeof id).toBe('number')
    expect(id).toBeGreaterThan(0)

    const results = await getActivitiesInWindow(now - 1000, now)
    expect(results).toHaveLength(1)
    expect(results[0].gCO2e).toBe(42)
    expect(results[0].id).toBe(id)
  })

  it('does not return records outside the time window', async () => {
    const now = Date.now()
    await writeActivity(makeActivity({ timestamp: now - 10_000 }))
    await writeActivity(makeActivity({ timestamp: now + 10_000 }))

    const results = await getActivitiesInWindow(now - 5000, now + 5000)
    expect(results).toHaveLength(0)
  })

  it('returns multiple records within the window', async () => {
    const now = Date.now()
    await writeActivity(makeActivity({ timestamp: now - 300, gCO2e: 1 }))
    await writeActivity(makeActivity({ timestamp: now - 200, gCO2e: 2 }))
    await writeActivity(makeActivity({ timestamp: now - 100, gCO2e: 3 }))

    const results = await getActivitiesInWindow(now - 500, now)
    expect(results).toHaveLength(3)
    const total = results.reduce((s, r) => s + r.gCO2e, 0)
    expect(total).toBeCloseTo(6, 10)
  })
})

describe('purgeOldActivities', () => {
  it('deletes records older than 30 days and returns the count', async () => {
    const now = Date.now()
    const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000
    const twentyNineDaysAgo = now - 29 * 24 * 60 * 60 * 1000

    await writeActivity(makeActivity({ timestamp: thirtyOneDaysAgo }))
    await writeActivity(makeActivity({ timestamp: thirtyOneDaysAgo - 1000 }))
    await writeActivity(makeActivity({ timestamp: twentyNineDaysAgo }))
    await writeActivity(makeActivity({ timestamp: now - 1000 }))

    const deleted = await purgeOldActivities()
    expect(deleted).toBe(2)

    const remaining = await db.activities.toArray()
    expect(remaining).toHaveLength(2)
    for (const r of remaining) {
      expect(r.timestamp).toBeGreaterThanOrEqual(now - 30 * 24 * 60 * 60 * 1000)
    }
  })

  it('returns 0 when there are no old records', async () => {
    await writeActivity(makeActivity({ timestamp: Date.now() - 1000 }))
    const deleted = await purgeOldActivities()
    expect(deleted).toBe(0)
  })
})

describe('getSetting / setSetting round-trip', () => {
  it('stores and retrieves a string setting', async () => {
    await setSetting('region', 'US-CAL-CISO')
    const value = await getSetting<string>('region')
    expect(value).toBe('US-CAL-CISO')
  })

  it('stores and retrieves an object setting', async () => {
    const categories = { video: true, ai: false, pageLoad: true }
    await setSetting('categories', categories)
    const value = await getSetting<typeof categories>('categories')
    expect(value).toEqual(categories)
  })

  it('returns undefined for a key that has not been set', async () => {
    const value = await getSetting('nonexistent')
    expect(value).toBeUndefined()
  })

  it('overwrites an existing setting', async () => {
    await setSetting('region', 'US-TEX-ERCO')
    await setSetting('region', 'US-NW-BPAT')
    const value = await getSetting<string>('region')
    expect(value).toBe('US-NW-BPAT')
  })
})

describe('clearAllData', () => {
  it('clears all activities, violations, and settings', async () => {
    const now = Date.now()
    await writeActivity(makeActivity({ timestamp: now - 1000 }))
    await writeActivity(makeActivity({ timestamp: now - 2000 }))
    await setSetting('region', 'US-CAL-CISO')
    await db.violations.add({
      timestamp: now,
      blockedDestination: 'evil.com',
      ruleViolated: 'allowlist',
      acknowledged: false,
    })

    await clearAllData()

    expect(await db.activities.count()).toBe(0)
    expect(await db.violations.count()).toBe(0)
    expect(await db.settings.count()).toBe(0)
  })

  it('resets all four aggregates to zero', async () => {
    const now = Date.now()
    await writeActivity(makeActivity({ timestamp: now - 1000, gCO2e: 100 }))
    await recomputeAggregates()

    await clearAllData()

    const keys: AggregateKey[] = ['1h', '24h', '7d', '30d']
    for (const key of keys) {
      const agg = await getAggregate(key)
      expect(agg).toBeDefined()
      expect(agg!.totalGCO2e).toBe(0)
      expect(agg!.videoUserGCO2e).toBe(0)
      expect(agg!.videoAutoplayGCO2e).toBe(0)
      expect(agg!.aiPromptGCO2e).toBe(0)
      expect(agg!.videoCallGCO2e).toBe(0)
      expect(agg!.pageLoadGCO2e).toBe(0)
    }
  })
})

describe('recomputeAggregates — autoplay vs user-initiated video', () => {
  it('correctly separates autoplay and user-initiated video carbon', async () => {
    const base = Date.now() - 5000
    await writeActivity(makeActivity({ timestamp: base,       gCO2e: 30, type: 'video_streaming', autoplay: false }))
    await writeActivity(makeActivity({ timestamp: base - 100, gCO2e: 20, type: 'video_streaming', autoplay: false }))
    await writeActivity(makeActivity({ timestamp: base - 200, gCO2e: 15, type: 'video_streaming', autoplay: true }))
    await writeActivity(makeActivity({ timestamp: base - 300, gCO2e: 5,  type: 'video_streaming', autoplay: true }))

    await recomputeAggregates()

    const agg = await getAggregate('1h')
    expect(agg).toBeDefined()
    expect(agg!.videoUserGCO2e).toBeCloseTo(50, 10)
    expect(agg!.videoAutoplayGCO2e).toBeCloseTo(20, 10)
    expect(agg!.totalGCO2e).toBeCloseTo(70, 10)
  })

  it('correctly attributes AI, video call, and page load carbon', async () => {
    const base = Date.now() - 5000
    await writeActivity(makeActivity({ timestamp: base,       gCO2e: 5, type: 'ai_prompt',  autoplay: false }))
    await writeActivity(makeActivity({ timestamp: base - 100, gCO2e: 8, type: 'video_call', autoplay: false }))
    await writeActivity(makeActivity({ timestamp: base - 200, gCO2e: 1, type: 'page_load',  autoplay: false }))

    await recomputeAggregates()

    const agg = await getAggregate('1h')
    expect(agg).toBeDefined()
    expect(agg!.aiPromptGCO2e).toBeCloseTo(5, 10)
    expect(agg!.videoCallGCO2e).toBeCloseTo(8, 10)
    expect(agg!.pageLoadGCO2e).toBeCloseTo(1, 10)
    expect(agg!.totalGCO2e).toBeCloseTo(14, 10)
  })
})

// ─── Property 10: Privacy field exclusion ─────────────────────────────────────
// Validates: Requirements 8.5

describe('Property 10: Activity records never contain privacy-sensitive fields', () => {
  const PROHIBITED_FIELDS = ['url', 'pageTitle', 'tabId', 'promptText', 'ipAddress'] as const

  it('ActivityRecord objects do not have prohibited fields', () => {
    const record = makeActivity()
    for (const field of PROHIBITED_FIELDS) {
      expect(record).not.toHaveProperty(field)
    }
  })

  it('generated ActivityRecord objects never contain prohibited fields (property-based)', () => {
    fc.assert(
      fc.property(
        fc.record({
          type: fc.constantFrom(
            'video_streaming', 'ai_prompt', 'video_call', 'page_load',
          ) as fc.Arbitrary<ActivityRecord['type']>,
          platform: fc.constantFrom('youtube', 'netflix', 'chatgpt', 'claude', 'gemini', 'generic'),
          durationSeconds: fc.float({ min: 0, max: 7200, noNaN: true }),
          deviceType: fc.constantFrom(
            'laptop', 'desktop', 'smartphone', 'tv',
          ) as fc.Arbitrary<ActivityRecord['deviceType']>,
          connectionType: fc.constantFrom(
            'fixed', 'cellular_4g',
          ) as fc.Arbitrary<ActivityRecord['connectionType']>,
          gCO2e: fc.float({ min: 0, max: 1000, noNaN: true }),
          gridIntensityUsed: fc.float({ min: 0, max: 1000, noNaN: true }),
          gridIntensitySource: fc.constantFrom(
            'electricitymaps', 'eia', 'static_fallback', 'global_average',
          ) as fc.Arbitrary<ActivityRecord['gridIntensitySource']>,
          autoplay: fc.boolean(),
          timestamp: fc.integer({ min: 0, max: Date.now() }),
        }),
        (record) => {
          for (const field of PROHIBITED_FIELDS) {
            expect(record).not.toHaveProperty(field)
          }
        },
      ),
    )
  })

  it('records written to and read from IndexedDB do not contain prohibited fields', async () => {
    const now = Date.now()
    const record = makeActivity({ timestamp: now - 500 })
    await writeActivity(record)

    const results = await getActivitiesInWindow(now - 1000, now)
    expect(results).toHaveLength(1)
    const stored = results[0]

    for (const field of PROHIBITED_FIELDS) {
      expect(stored).not.toHaveProperty(field)
    }
  })
})

// ─── Property 11: Aggregate totals equal sum of individual records ─────────────
// Validates: Requirements 8.3

describe('Property 11: Aggregate totals equal sum of individual records', () => {
  it(
    'each aggregate total equals the arithmetic sum of gCO2e values in that window',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              gCO2e: fc.float({ min: 0, max: 500, noNaN: true }),
              // Use min: 1 so records are always strictly in the past
              offsetMs: fc.integer({ min: 1, max: 30 * 24 * 60 * 60 * 1000 - 1 }),
              type: fc.constantFrom(
                'video_streaming', 'ai_prompt', 'video_call', 'page_load',
              ) as fc.Arbitrary<ActivityRecord['type']>,
              autoplay: fc.boolean(),
            }),
            { minLength: 1, maxLength: 10 },
          ),
          async (items) => {
            await clearAllData()

            const now = Date.now()
            const records = items.map(({ gCO2e, offsetMs, type, autoplay }) =>
              makeActivity({ gCO2e, timestamp: now - offsetMs, type, autoplay }),
            )

            for (const r of records) {
              await writeActivity(r)
            }

            await recomputeAggregates()

            const windows: Array<{ key: AggregateKey; maxOffsetMs: number }> = [
              { key: '1h',  maxOffsetMs: 1 * 60 * 60 * 1000 },
              { key: '24h', maxOffsetMs: 24 * 60 * 60 * 1000 },
              { key: '7d',  maxOffsetMs: 7 * 24 * 60 * 60 * 1000 },
              { key: '30d', maxOffsetMs: 30 * 24 * 60 * 60 * 1000 },
            ]

            for (const { key, maxOffsetMs } of windows) {
              const expectedTotal = records
                .filter(r => (now - r.timestamp) <= maxOffsetMs)
                .reduce((sum, r) => sum + r.gCO2e, 0)

              const agg = await getAggregate(key)
              expect(agg).toBeDefined()
              expect(agg!.totalGCO2e).toBeCloseTo(expectedTotal, 5)
            }
          },
        ),
        { numRuns: 25 },
      )
    },
    60_000,
  )
})

// ─── Property 12: Autoplay attribution ────────────────────────────────────────
// Validates: Requirements 11.1

describe('Property 12: Autoplay activities are attributed to the autoplay bucket', () => {
  it(
    'videoAutoplayGCO2e equals sum of gCO2e for autoplay:true records, videoUserGCO2e for autoplay:false',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              gCO2e: fc.float({ min: 0, max: 500, noNaN: true }),
              autoplay: fc.boolean(),
              // All within the 1h window; use min: 1 so records are strictly in the past
              offsetMs: fc.integer({ min: 1, max: 59 * 60 * 1000 }),
            }),
            { minLength: 1, maxLength: 10 },
          ),
          async (items) => {
            await clearAllData()

            const now = Date.now()
            for (const { gCO2e, autoplay, offsetMs } of items) {
              await writeActivity(
                makeActivity({
                  type: 'video_streaming',
                  gCO2e,
                  autoplay,
                  timestamp: now - offsetMs,
                }),
              )
            }

            await recomputeAggregates()

            const expectedAutoplay = items
              .filter(i => i.autoplay)
              .reduce((s, i) => s + i.gCO2e, 0)
            const expectedUser = items
              .filter(i => !i.autoplay)
              .reduce((s, i) => s + i.gCO2e, 0)

            const agg = await getAggregate('1h')
            expect(agg).toBeDefined()
            expect(agg!.videoAutoplayGCO2e).toBeCloseTo(expectedAutoplay, 5)
            expect(agg!.videoUserGCO2e).toBeCloseTo(expectedUser, 5)

            // Autoplay and user buckets must not overlap — their sum equals total
            expect(agg!.videoAutoplayGCO2e + agg!.videoUserGCO2e).toBeCloseTo(
              agg!.totalGCO2e,
              5,
            )
          },
        ),
        { numRuns: 25 },
      )
    },
    60_000,
  )

  it('autoplay:true records are NOT included in videoUserGCO2e', async () => {
    const base = Date.now() - 5000
    await writeActivity(makeActivity({ type: 'video_streaming', autoplay: true,  gCO2e: 50, timestamp: base }))
    await writeActivity(makeActivity({ type: 'video_streaming', autoplay: false, gCO2e: 30, timestamp: base - 100 }))

    await recomputeAggregates()

    const agg = await getAggregate('1h')
    expect(agg!.videoAutoplayGCO2e).toBeCloseTo(50, 10)
    expect(agg!.videoUserGCO2e).toBeCloseTo(30, 10)
  })
})
