// src/messages.ts — shared message types between content scripts and service worker

import type { ActivityType, QualityTier, DeviceType, ConnectionType } from './carbon-calculator'

export interface ActivityStartPayload {
  type: ActivityType
  platform: string
  quality?: QualityTier
  deviceType: DeviceType
  connectionType: ConnectionType
  autoplay: boolean
  startTimestamp: number
  characterCount?: number  // AI prompts only
  videoDurationSeconds?: number  // total video duration (from video.duration)
}

export interface ActivityStopPayload {
  platform: string
  stopTimestamp: number
}

export interface QualityChangePayload {
  platform: string
  newQuality: QualityTier
  changeTimestamp: number
}

export interface BadgeUpdateMessage {
  type: 'BADGE_UPDATE'
  sessionCarbonG: number
  autoplayCarbonG: number
  comparisonQuality?: {
    current: QualityTier
    lower: QualityTier
    lowerG: number
  }
}

export type ExtensionMessage =
  | { type: 'ACTIVITY_START'; payload: ActivityStartPayload }
  | { type: 'ACTIVITY_STOP'; payload: ActivityStopPayload }
  | { type: 'QUALITY_CHANGE'; payload: QualityChangePayload }
  | { type: 'GET_AGGREGATES' }
  | { type: 'GET_GRID_FORECAST' }
  | { type: 'CLEAR_DATA' }
  | { type: 'SET_REGION'; payload: { regionCode: string } }
  | { type: 'DISMISS_NUDGE'; payload: { activityType: ActivityType } }
  | { type: 'NUDGE_SHOW'; payload: { message: string; bestHour: number } }
  | { type: 'VIDEO_PREVIEW'; payload: {
    platform: string
    durationMinutes: number
    quality: QualityTier
    predictedCarbonG: number
    lowerQuality: QualityTier
    lowerCarbonG: number
    qualitySavingsPct: number
    bestHour: number
    bestHourCarbonG: number
    timeSavingsPct: number
    googleSearches: number
  }}
  | { type: 'GET_VIDEO_CONTEXT' }
