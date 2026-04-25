# Spec: Activity Aggregator

## Responsibilities

Buffers activity events from content scripts, debounces rapid events, and commits records to IndexedDB. Maintains pre-computed rolling totals for fast popup rendering.

## Event Flow

```
Content Script → chrome.runtime.sendMessage → Service Worker → Buffer → Debounce → IndexedDB
```

## Buffering & Debounce

- Events are buffered in memory in the service worker
- Committed to IndexedDB within **30 seconds** of receipt
- Rapid quality-change events are debounced (coalesced into segments)

## Rolling Aggregates

Pre-computed and stored in IndexedDB alongside the raw activity log:

| Key   | Window         |
|-------|----------------|
| `1h`  | Last 1 hour    |
| `24h` | Last 24 hours  |
| `7d`  | Last 7 days    |
| `30d` | Last 30 days   |

Each aggregate record contains:
```typescript
{
  key: "1h" | "24h" | "7d" | "30d"
  totalGCO2e: number
  videoUserGCO2e: number       // user-initiated video
  videoAutoplayGCO2e: number   // autoplay video (see autoplay_auditor.spec.md)
  aiPromptGCO2e: number
  videoCallGCO2e: number
  pageLoadGCO2e: number
  lastUpdated: number          // Unix ms
}
```

## Purge

- Activity records older than **30 days** are automatically deleted
- Purge runs daily via `chrome.alarms`

## Activity Record Schema

Fields stored per activity:
```typescript
{
  id: number                   // auto-increment
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
  timestamp: number            // Unix ms, rounded to nearest minute
}
```

Fields **never** stored:
- URL or URL fragment
- Page title
- Tab ID
- Prompt text
- IP address

## Correctness Properties

- Aggregate totals equal the arithmetic sum of `gCO2e` values of all records in the window
- Autoplay records appear in `videoAutoplayGCO2e` only, never in `videoUserGCO2e`
- No prohibited fields are present in any stored record
- `clearAllData()` completes within 5 seconds and resets all aggregates to zero
