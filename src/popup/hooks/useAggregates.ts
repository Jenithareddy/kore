// src/popup/hooks/useAggregates.ts
// React hook to read aggregates directly from IndexedDB via Dexie (no service worker round-trip)

import { useState, useEffect } from 'react'
import { getAggregate, getActivitiesInWindow, type AggregateRecord, type AggregateKey, type ActivityRecord } from '../../db'

export interface Aggregates {
  session: AggregateRecord | undefined
  today: AggregateRecord | undefined
  sevenDay: AggregateRecord | undefined
  thirtyDay: AggregateRecord | undefined
  loading: boolean
}

const emptyAggregate = (key: AggregateKey): AggregateRecord => ({
  key,
  totalGCO2e: 0,
  videoUserGCO2e: 0,
  videoAutoplayGCO2e: 0,
  aiPromptGCO2e: 0,
  videoCallGCO2e: 0,
  pageLoadGCO2e: 0,
  lastUpdated: Date.now(),
})

export function useAggregates(): Aggregates {
  const [aggregates, setAggregates] = useState<Aggregates>({
    session: undefined,
    today: undefined,
    sevenDay: undefined,
    thirtyDay: undefined,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [h1, h24, d7, d30] = await Promise.all([
        getAggregate('1h'),
        getAggregate('24h'),
        getAggregate('7d'),
        getAggregate('30d'),
      ])

      if (!cancelled) {
        setAggregates({
          session: h1 ?? emptyAggregate('1h'),
          today: h24 ?? emptyAggregate('24h'),
          sevenDay: d7 ?? emptyAggregate('7d'),
          thirtyDay: d30 ?? emptyAggregate('30d'),
          loading: false,
        })
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return aggregates
}

export interface DailyTotal {
  date: string  // YYYY-MM-DD
  gCO2e: number
}

export function useDailyTotals(days: number = 7): { dailyTotals: DailyTotal[]; loading: boolean } {
  const [dailyTotals, setDailyTotals] = useState<DailyTotal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const now = Date.now()
      const startMs = now - days * 24 * 60 * 60 * 1000
      const records = await getActivitiesInWindow(startMs, now)

      // Helper: get local YYYY-MM-DD string
      function toLocalDateStr(ms: number): string {
        const d = new Date(ms)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }

      // Group by local day
      const byDay = new Map<string, number>()
      for (const r of records) {
        const date = toLocalDateStr(r.timestamp)
        byDay.set(date, (byDay.get(date) ?? 0) + r.gCO2e)
      }

      // Fill in missing days with 0 (using local dates)
      const result: DailyTotal[] = []
      for (let i = days - 1; i >= 0; i--) {
        const dateStr = toLocalDateStr(now - i * 24 * 60 * 60 * 1000)
        result.push({ date: dateStr, gCO2e: byDay.get(dateStr) ?? 0 })
      }

      if (!cancelled) {
        setDailyTotals(result)
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [days])

  return { dailyTotals, loading }
}

export function useRecentActivity(): { recent: ActivityRecord | null; loading: boolean } {
  const [recent, setRecent] = useState<ActivityRecord | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const now = Date.now()
      const records = await getActivitiesInWindow(now - 60 * 60 * 1000, now)
      if (!cancelled) {
        // Get the most recent record
        const sorted = records.sort((a, b) => b.timestamp - a.timestamp)
        setRecent(sorted[0] ?? null)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return { recent, loading }
}
