// src/ethics-gate/violation-logger.ts
// Ethics Gate — violation logging to local IndexedDB.
// Violations are never reported to any external service.

import { db, type ViolationRecord } from '../db'

export async function logViolation(blockedDestination: string, ruleViolated: string): Promise<void> {
  await db.violations.add({
    timestamp: Date.now(),
    blockedDestination,
    ruleViolated,
    acknowledged: false,
  })
  console.warn(`[BandWatt Ethics Gate] Violation: ${ruleViolated} → ${blockedDestination}`)
}

export async function getUnacknowledgedViolations(): Promise<ViolationRecord[]> {
  return db.violations.filter(v => !v.acknowledged).toArray()
}

export async function acknowledgeViolation(id: number): Promise<void> {
  await db.violations.update(id, { acknowledged: true })
}
