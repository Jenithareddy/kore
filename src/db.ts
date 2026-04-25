// IndexedDB Store — Dexie schema, read/write, and purge

import Dexie, { type Table } from 'dexie'
import type { ActivityType, QualityTier, DeviceType, ConnectionType } from './carbon-calculator'

// Re-export GridSource type here since grid-client.ts is not yet implemented
export type GridSource = 'electricitymaps' | 'eia' | 'static_fallback' | 'global_average'
export type AggregateKey = '1h' | '24h' | '7d' | '30d'

export interface ActivityRecord {
  id?: number
  type: ActivityType
  platform: string
  durationSeconds: number
  qualityTier?: QualityTier
  deviceType: DeviceType
  connectionType: ConnectionType
  gCO2e: number
  gridIntensityUsed: number
  gridIntensitySource: GridSource
  autoplay: boolean
  timestamp: number  // Unix ms, rounded to nearest minute
  // NOT stored: url, pageTitle, tabId, promptText, ipAddress
}

export interface AggregateRecord {
  key: AggregateKey
  totalGCO2e: number
  videoUserGCO2e: number
  videoAutoplayGCO2e: number
  aiPromptGCO2e: number
  videoCallGCO2e: number
  pageLoadGCO2e: number
  lastUpdated: number
}

export interface ViolationRecord {
  id?: number
  timestamp: number
  blockedDestination: string
  ruleViolated: string
  acknowledged: boolean
}

export interface SettingsRecord {
  key: string
  value: unknown
}

class WattWiseDB extends Dexie {
  activities!: Table<ActivityRecord>
  aggregates!: Table<AggregateRecord>
  violations!: Table<ViolationRecord>
  settings!: Table<SettingsRecord>

  constructor() {
    super('wattwise')
    this.version(1).stores({
      activities: '++id, timestamp, type, platform, autoplay',
      aggregates: 'key',
      violations: '++id, timestamp',
      settings: 'key',
    })
  }
}

export const db = new WattWiseDB()

// ─── ActivityRecord helpers ───────────────────────────────────────────────────

/**
 * Write an activity record to IndexedDB.
 * @returns The auto-incremented id of the new record.
 */
export async function writeActivity(record: ActivityRecord): Promise<number> {
  return db.activities.add(record)
}

/**
 * Retrieve all activity records whose timestamp falls within [startMs, endMs] (inclusive).
 */
export async function getActivitiesInWindow(startMs: number, endMs: number): Promise<ActivityRecord[]> {
  return db.activities.where('timestamp').between(startMs, endMs, true, true).toArray()
}

// ─── Aggregate helpers ────────────────────────────────────────────────────────

/**
 * Read a single aggregate record by key.
 */
export async function getAggregate(key: AggregateKey): Promise<AggregateRecord | undefined> {
  return db.aggregates.get(key)
}

/**
 * Write (upsert) an aggregate record.
 */
export async function setAggregate(record: AggregateRecord): Promise<void> {
  await db.aggregates.put(record)
}

/**
 * Recompute all four rolling aggregate windows from the raw activity log.
 */
export async function recomputeAggregates(): Promise<void> {
  const now = Date.now()
  const windows: Array<{ key: AggregateKey; startMs: number }> = [
    { key: '1h',  startMs: now - 1 * 60 * 60 * 1000 },
    { key: '24h', startMs: now - 24 * 60 * 60 * 1000 },
    { key: '7d',  startMs: now - 7 * 24 * 60 * 60 * 1000 },
    { key: '30d', startMs: now - 30 * 24 * 60 * 60 * 1000 },
  ]

  for (const { key, startMs } of windows) {
    const records = await getActivitiesInWindow(startMs, now)
    const agg: AggregateRecord = {
      key,
      totalGCO2e: 0,
      videoUserGCO2e: 0,
      videoAutoplayGCO2e: 0,
      aiPromptGCO2e: 0,
      videoCallGCO2e: 0,
      pageLoadGCO2e: 0,
      lastUpdated: now,
    }
    for (const r of records) {
      agg.totalGCO2e += r.gCO2e
      if (r.type === 'video_streaming') {
        if (r.autoplay) agg.videoAutoplayGCO2e += r.gCO2e
        else agg.videoUserGCO2e += r.gCO2e
      } else if (r.type === 'ai_prompt') {
        agg.aiPromptGCO2e += r.gCO2e
      } else if (r.type === 'video_call') {
        agg.videoCallGCO2e += r.gCO2e
      } else if (r.type === 'page_load') {
        agg.pageLoadGCO2e += r.gCO2e
      }
    }
    await setAggregate(agg)
  }
}

// ─── Purge ────────────────────────────────────────────────────────────────────

/**
 * Delete all activity records older than 30 days.
 * @returns The number of deleted records.
 */
export async function purgeOldActivities(): Promise<number> {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  return db.activities.where('timestamp').below(cutoff).delete()
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

/**
 * Read a setting value by key.
 */
export async function getSetting<T>(key: string): Promise<T | undefined> {
  const record = await db.settings.get(key)
  return record?.value as T | undefined
}

/**
 * Write (upsert) a setting value.
 */
export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value })
}

// ─── clearAllData ─────────────────────────────────────────────────────────────

/**
 * Delete all records from all tables and reset aggregates to zero.
 * Must complete within 5 seconds (Requirement 8.6).
 */
export async function clearAllData(): Promise<void> {
  await Promise.all([
    db.activities.clear(),
    db.violations.clear(),
    db.settings.clear(),
  ])
  const emptyAgg = (key: AggregateKey): AggregateRecord => ({
    key,
    totalGCO2e: 0,
    videoUserGCO2e: 0,
    videoAutoplayGCO2e: 0,
    aiPromptGCO2e: 0,
    videoCallGCO2e: 0,
    pageLoadGCO2e: 0,
    lastUpdated: Date.now(),
  })
  await db.aggregates.bulkPut(['1h', '24h', '7d', '30d'].map(k => emptyAgg(k as AggregateKey)))
}
