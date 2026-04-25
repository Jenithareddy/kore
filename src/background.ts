// src/background.ts — BandWatt Service Worker

import { computeCarbon, compareQualities, toComparisonAnchors } from './carbon-calculator'
import type { Activity, QualityTier, DeviceType, ConnectionType } from './carbon-calculator'
import {
  writeActivity,
  recomputeAggregates,
  getAggregate,
  getSetting,
  setSetting,
  purgeOldActivities,
  clearAllData,
  type ActivityRecord,
} from './db'
import { getGridIntensity, getHourlyForecast } from './grid-client'
import { evaluateNudge, formatNudgeMessage, isNudgeCooledDown } from './scheduler-nudge'
import type {
  ExtensionMessage,
  ActivityStartPayload,
  BadgeUpdateMessage,
} from './messages'

console.log('[BandWatt] Service worker started')

// ─── In-progress activity tracking ───────────────────────────────────────────

interface InProgressActivity {
  payload: ActivityStartPayload
  startTimestamp: number
}

// Keyed by platform — one active session per platform at a time
const inProgress = new Map<string, InProgressActivity>()

// Session carbon totals (reset on service worker restart)
let sessionCarbonG = 0
let sessionAutoplayCarbonG = 0

// Badge update debounce
let badgeDebounceTimer: ReturnType<typeof setTimeout> | null = null
const BADGE_DEBOUNCE_MS = 5000

// ─── Alarm setup ─────────────────────────────────────────────────────────────

chrome.alarms.create('wattwise-keepalive', { periodInMinutes: 1 })
chrome.alarms.create('wattwise-purge', { periodInMinutes: 24 * 60 })

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'wattwise-purge') {
    purgeOldActivities().catch(console.error)
  }
  // keepalive alarm just wakes the service worker — no action needed
})

// ─── onInstalled — open onboarding on first install ──────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const onboardingComplete = await getSetting<boolean>('onboardingComplete')
    if (!onboardingComplete) {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') })
    }
  }
})

// ─── Message dispatcher ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    handleMessage(message, sendResponse, _sender.tab?.id)
    // Return true to keep the message channel open for async responses
    return true
  }
)

async function handleMessage(
  message: ExtensionMessage,
  sendResponse: (response?: unknown) => void,
  senderTabId?: number,
): Promise<void> {
  try {
    switch (message.type) {
      case 'ACTIVITY_START':
        await handleActivityStart(message.payload, senderTabId)
        sendResponse({ ok: true })
        break

      case 'ACTIVITY_STOP':
        await handleActivityStop(message.payload.platform, message.payload.stopTimestamp)
        sendResponse({ ok: true })
        break

      case 'QUALITY_CHANGE':
        await handleQualityChange(
          message.payload.platform,
          message.payload.newQuality,
          message.payload.changeTimestamp,
        )
        sendResponse({ ok: true })
        break

      case 'GET_AGGREGATES': {
        const [h1, h24, d7, d30] = await Promise.all([
          getAggregate('1h'),
          getAggregate('24h'),
          getAggregate('7d'),
          getAggregate('30d'),
        ])
        sendResponse({ '1h': h1, '24h': h24, '7d': d7, '30d': d30 })
        break
      }

      case 'GET_GRID_FORECAST': {
        const region = await getSetting<string>('region')
        const forecast = await getHourlyForecast(region, 24)
        sendResponse({ forecast })
        break
      }

      case 'SET_REGION':
        await setSetting('region', message.payload.regionCode)
        sendResponse({ ok: true })
        break

      case 'CLEAR_DATA':
        await clearAllData()
        sessionCarbonG = 0
        sessionAutoplayCarbonG = 0
        sendResponse({ ok: true })
        break

      case 'DISMISS_NUDGE': {
        const cooldowns = (await getSetting<Record<string, number>>('nudgeCooldowns')) ?? {}
        cooldowns[message.payload.activityType] = Date.now()
        await setSetting('nudgeCooldowns', cooldowns)
        sendResponse({ ok: true })
        break
      }

      case 'GET_VIDEO_CONTEXT': {
        // Find any in-progress video activity
        let videoContext = null
        for (const [platform, session] of inProgress.entries()) {
          if (session.payload.type === 'video_streaming' && session.payload.videoDurationSeconds) {
            const region = await getSetting<string>('region')
            const gridResult = await getGridIntensity(region)
            const forecast = await getHourlyForecast(region, 24)
            const quality: QualityTier = session.payload.quality ?? '1080p'
            const durationSec = session.payload.videoDurationSeconds

            // Current quality carbon
            const currentResult = computeCarbon({
              type: 'video_streaming', durationSeconds: durationSec, quality,
              deviceType: session.payload.deviceType, connectionType: session.payload.connectionType,
              autoplay: false,
            }, gridResult.gCO2ePerKWh)

            // Lower quality carbon (one step down)
            const qualityOrder: QualityTier[] = ['480p', '720p', '1080p', '4K']
            const currentIdx = qualityOrder.indexOf(quality)
            const lowerQuality = currentIdx > 0 ? qualityOrder[currentIdx - 1] : quality
            const lowerResult = computeCarbon({
              type: 'video_streaming', durationSeconds: durationSec, quality: lowerQuality,
              deviceType: session.payload.deviceType, connectionType: session.payload.connectionType,
              autoplay: false,
            }, gridResult.gCO2ePerKWh)

            // Best hour carbon (using lowest grid intensity from forecast)
            const minIntensity = Math.min(...forecast.map(f => f.gCO2ePerKWh))
            const bestHourOffset = forecast.findIndex(f => f.gCO2ePerKWh === minIntensity)
            const bestHourResult = computeCarbon({
              type: 'video_streaming', durationSeconds: durationSec, quality,
              deviceType: session.payload.deviceType, connectionType: session.payload.connectionType,
              autoplay: false,
            }, minIntensity)

            // Comparison anchors
            const anchors = toComparisonAnchors(currentResult.gCO2e)

            const currentHour = new Date().getHours()

            videoContext = {
              platform,
              quality,
              durationMinutes: Math.round(durationSec / 60),
              currentCarbonG: Math.round(currentResult.gCO2e * 10) / 10,
              gridIntensity: gridResult.gCO2ePerKWh,
              // Quality comparison
              lowerQuality,
              lowerCarbonG: Math.round(lowerResult.gCO2e * 10) / 10,
              qualitySavingsPct: currentResult.gCO2e > 0 ? Math.round(((currentResult.gCO2e - lowerResult.gCO2e) / currentResult.gCO2e) * 100) : 0,
              // Time comparison
              bestHour: (currentHour + bestHourOffset) % 24,
              bestHourCarbonG: Math.round(bestHourResult.gCO2e * 10) / 10,
              bestHourIntensity: minIntensity,
              timeSavingsPct: currentResult.gCO2e > 0 ? Math.round(((currentResult.gCO2e - bestHourResult.gCO2e) / currentResult.gCO2e) * 100) : 0,
              // Analogies
              googleSearches: Math.round(anchors.googleSearches * 10) / 10,
              phoneCharges: Math.round(anchors.phoneCharges * 100) / 100,
              milesNotDriven: Math.round(anchors.milesNotDriven * 100) / 100,
              // Forecast for grid tab
              forecast: forecast.map((f, i) => ({
                hour: (currentHour + i) % 24,
                intensity: f.gCO2ePerKWh,
                videoCarbonG: Math.round(computeCarbon({
                  type: 'video_streaming', durationSeconds: durationSec, quality,
                  deviceType: session.payload.deviceType, connectionType: session.payload.connectionType,
                  autoplay: false,
                }, f.gCO2ePerKWh).gCO2e * 10) / 10,
              })),
            }
            break
          }
        }
        sendResponse({ videoContext })
        break
      }

      default:
        sendResponse({ ok: false, error: 'Unknown message type' })
    }
  } catch (err) {
    console.error('[BandWatt] handleMessage error:', err)
    sendResponse({ ok: false, error: String(err) })
  }
}

// ─── Activity lifecycle ───────────────────────────────────────────────────────

async function handleActivityStart(payload: ActivityStartPayload, senderTabId?: number): Promise<void> {
  inProgress.set(payload.platform, { payload, startTimestamp: payload.startTimestamp })
  console.log(`[BandWatt] Activity started: ${payload.platform} (${payload.type})`)

  // Evaluate scheduler nudge for long video activities
  if (payload.type === 'video_streaming') {
    evaluateSchedulerNudge(payload).catch(console.error)
  }

  // Compute and send video carbon preview to the originating tab
  if (payload.videoDurationSeconds && payload.videoDurationSeconds > 0 && senderTabId) {
    try {
      const region = await getSetting<string>('region')
      const gridResult = await getGridIntensity(region)
      const forecast = await getHourlyForecast(region, 24)
      const quality: QualityTier = payload.quality ?? '1080p'
      const durationSec = payload.videoDurationSeconds

      const predictedResult = computeCarbon({
        type: payload.type, durationSeconds: durationSec, quality,
        deviceType: payload.deviceType, connectionType: payload.connectionType, autoplay: false,
      }, gridResult.gCO2ePerKWh)

      // Lower quality
      const qualityOrder: QualityTier[] = ['480p', '720p', '1080p', '4K']
      const currentIdx = qualityOrder.indexOf(quality)
      const lowerQuality = currentIdx > 0 ? qualityOrder[currentIdx - 1] : quality
      const lowerResult = computeCarbon({
        type: 'video_streaming', durationSeconds: durationSec, quality: lowerQuality,
        deviceType: payload.deviceType, connectionType: payload.connectionType, autoplay: false,
      }, gridResult.gCO2ePerKWh)

      // Best hour
      const minIntensity = Math.min(...forecast.map(f => f.gCO2ePerKWh))
      const bestHourOffset = forecast.findIndex(f => f.gCO2ePerKWh === minIntensity)
      const bestHourResult = computeCarbon({
        type: 'video_streaming', durationSeconds: durationSec, quality,
        deviceType: payload.deviceType, connectionType: payload.connectionType, autoplay: false,
      }, minIntensity)

      const currentHour = new Date().getHours()
      const anchors = toComparisonAnchors(predictedResult.gCO2e)

      chrome.tabs.sendMessage(senderTabId, {
        type: 'VIDEO_PREVIEW',
        payload: {
          platform: payload.platform,
          durationMinutes: Math.round(durationSec / 60),
          quality,
          predictedCarbonG: Math.round(predictedResult.gCO2e * 10) / 10,
          lowerQuality,
          lowerCarbonG: Math.round(lowerResult.gCO2e * 10) / 10,
          qualitySavingsPct: predictedResult.gCO2e > 0 ? Math.round(((predictedResult.gCO2e - lowerResult.gCO2e) / predictedResult.gCO2e) * 100) : 0,
          bestHour: (currentHour + bestHourOffset) % 24,
          bestHourCarbonG: Math.round(bestHourResult.gCO2e * 10) / 10,
          timeSavingsPct: predictedResult.gCO2e > 0 ? Math.round(((predictedResult.gCO2e - bestHourResult.gCO2e) / predictedResult.gCO2e) * 100) : 0,
          googleSearches: Math.round(anchors.googleSearches * 10) / 10,
        },
      }).catch(() => {})
    } catch (err) {
      console.error('[BandWatt] Video preview computation failed:', err)
    }
  }
}

async function evaluateSchedulerNudge(payload: ActivityStartPayload): Promise<void> {
  // Check cooldown first
  const cooldowns = await getSetting<Record<string, number>>('nudgeCooldowns')
  if (isNudgeCooledDown(cooldowns, payload.type)) return

  const region = await getSetting<string>('region')
  const forecast = await getHourlyForecast(region, 24)
  if (forecast.length === 0) return

  const confidence = forecast[0].confidence
  // Use a default duration estimate of 90 minutes for nudge evaluation
  const durationMinutes = 90
  const decision = evaluateNudge(forecast, durationMinutes, confidence)

  if (!decision.shouldNudge) return

  const message = formatNudgeMessage(
    durationMinutes,
    decision.currentCarbonG,
    decision.bestHour,
    decision.bestCarbonG,
    decision.savingsPct,
  )

  // Send NUDGE_SHOW to all tabs
  const tabs = await chrome.tabs.query({})
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'NUDGE_SHOW',
        payload: { message, bestHour: decision.bestHour },
      }).catch(() => {})
    }
  }
}

async function handleActivityStop(platform: string, stopTimestamp: number): Promise<void> {
  const session = inProgress.get(platform)
  if (!session) return
  inProgress.delete(platform)

  const durationSeconds = Math.max(0, (stopTimestamp - session.startTimestamp) / 1000)
  await commitActivity(session.payload, durationSeconds, stopTimestamp)
}

async function handleQualityChange(
  platform: string,
  newQuality: QualityTier,
  changeTimestamp: number,
): Promise<void> {
  const session = inProgress.get(platform)
  if (!session) return

  // Close the current segment
  const durationSeconds = Math.max(0, (changeTimestamp - session.startTimestamp) / 1000)
  await commitActivity(session.payload, durationSeconds, changeTimestamp)

  // Open a new segment with the updated quality
  inProgress.set(platform, {
    payload: { ...session.payload, quality: newQuality },
    startTimestamp: changeTimestamp,
  })
}

async function commitActivity(
  payload: ActivityStartPayload,
  durationSeconds: number,
  stopTimestamp: number,
): Promise<void> {
  if (durationSeconds <= 0) return

  const region = await getSetting<string>('region')
  const gridResult = await getGridIntensity(region)

  const activity: Activity = {
    type: payload.type,
    durationSeconds,
    quality: payload.quality,
    deviceType: payload.deviceType as DeviceType,
    connectionType: payload.connectionType as ConnectionType,
    characterCount: payload.characterCount,
    autoplay: payload.autoplay,
  }

  const carbonResult = computeCarbon(activity, gridResult.gCO2ePerKWh)

  const record: ActivityRecord = {
    type: payload.type,
    platform: payload.platform,
    durationSeconds,
    qualityTier: payload.quality,
    deviceType: payload.deviceType as DeviceType,
    connectionType: payload.connectionType as ConnectionType,
    gCO2e: carbonResult.gCO2e,
    gridIntensityUsed: gridResult.gCO2ePerKWh,
    gridIntensitySource: gridResult.source,
    autoplay: payload.autoplay,
    timestamp: Math.round(stopTimestamp / 60000) * 60000, // round to nearest minute
  }

  await writeActivity(record)
  await recomputeAggregates()

  // Update session totals
  sessionCarbonG += carbonResult.gCO2e
  if (payload.autoplay) sessionAutoplayCarbonG += carbonResult.gCO2e

  // Schedule badge update (debounced)
  scheduleBadgeUpdate(payload.quality, gridResult.gCO2ePerKWh, activity)

  console.log(`[BandWatt] Activity committed: ${payload.platform} ${durationSeconds.toFixed(0)}s = ${carbonResult.gCO2e.toFixed(2)}g CO₂e`)
}

// ─── Badge relay ──────────────────────────────────────────────────────────────

function scheduleBadgeUpdate(
  currentQuality: QualityTier | undefined,
  gridIntensity: number,
  activity: Activity,
): void {
  if (badgeDebounceTimer) clearTimeout(badgeDebounceTimer)
  badgeDebounceTimer = setTimeout(() => {
    sendBadgeUpdate(currentQuality, gridIntensity, activity).catch(console.error)
  }, BADGE_DEBOUNCE_MS)
}

async function sendBadgeUpdate(
  currentQuality: QualityTier | undefined,
  gridIntensity: number,
  activity: Activity,
): Promise<void> {
  const qualityComparisonEnabled = await getSetting<boolean>('qualityComparisonEnabled')

  let comparisonQuality: BadgeUpdateMessage['comparisonQuality']
  if (qualityComparisonEnabled && currentQuality && currentQuality !== '480p') {
    const qualityOrder: QualityTier[] = ['480p', '720p', '1080p', '4K']
    const currentIndex = qualityOrder.indexOf(currentQuality)
    const lowerQuality = qualityOrder[currentIndex - 1]
    if (lowerQuality) {
      const comparison = compareQualities(activity, currentQuality, lowerQuality, gridIntensity)
      comparisonQuality = {
        current: currentQuality,
        lower: lowerQuality,
        lowerG: comparison.tierB.gCO2e,
      }
    }
  }

  const badgeMessage: BadgeUpdateMessage = {
    type: 'BADGE_UPDATE',
    sessionCarbonG,
    autoplayCarbonG: sessionAutoplayCarbonG,
    comparisonQuality,
  }

  // Send to all tabs
  const tabs = await chrome.tabs.query({})
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, badgeMessage).catch(() => {
        // Tab may not have the content script — ignore errors
      })
    }
  }
}
