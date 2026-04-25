// src/scheduler-nudge.ts
// Scheduler Nudge — evaluates whether to surface a nudge based on grid forecast

import type { HourlyForecast, GridConfidence } from './grid-client'

export interface NudgeDecision {
  shouldNudge: boolean
  currentIntensity: number
  bestHour: number          // offset from now (0-23)
  bestIntensity: number
  savingsPct: number        // percentage reduction
  currentCarbonG: number
  bestCarbonG: number
}

/**
 * Evaluate whether a scheduler nudge should be shown.
 *
 * Nudge fires if and only if:
 * 1. A future hour reduces carbon cost by >= 30%
 * 2. Grid confidence is "medium" or "high"
 *
 * @param forecast - 24-hour grid intensity forecast
 * @param activityDurationMinutes - estimated duration of the activity
 * @param confidence - grid data confidence level
 * @returns NudgeDecision
 */
export function evaluateNudge(
  forecast: HourlyForecast[],
  activityDurationMinutes: number,
  confidence: GridConfidence,
): NudgeDecision {
  const noNudge: NudgeDecision = {
    shouldNudge: false,
    currentIntensity: 0,
    bestHour: 0,
    bestIntensity: 0,
    savingsPct: 0,
    currentCarbonG: 0,
    bestCarbonG: 0,
  }

  // Only nudge when confidence is medium or high
  if (confidence !== 'medium' && confidence !== 'high') {
    return noNudge
  }

  if (forecast.length < 2) return noNudge

  const currentIntensity = forecast[0].gCO2ePerKWh
  if (currentIntensity <= 0) return noNudge

  // Find the best future hour (skip hour 0 = current)
  let bestHour = 0
  let bestIntensity = currentIntensity
  for (let i = 1; i < forecast.length; i++) {
    if (forecast[i].gCO2ePerKWh < bestIntensity) {
      bestIntensity = forecast[i].gCO2ePerKWh
      bestHour = i
    }
  }

  // Compute savings percentage
  const savingsPct = ((currentIntensity - bestIntensity) / currentIntensity) * 100

  // Only nudge if savings >= 30%
  if (savingsPct < 30) {
    return { ...noNudge, currentIntensity, bestHour, bestIntensity, savingsPct }
  }

  // Compute approximate carbon for the activity at current vs best hour
  // Using a simplified model: carbon ∝ intensity (same energy, different grid)
  const durationHours = activityDurationMinutes / 60
  // Rough energy estimate for a 1080p video (most common)
  const energyKWh = (3.0 * 0.077 + 0.030) * durationHours
  const currentCarbonG = energyKWh * currentIntensity
  const bestCarbonG = energyKWh * bestIntensity

  return {
    shouldNudge: true,
    currentIntensity,
    bestHour,
    bestIntensity,
    savingsPct: Math.round(savingsPct),
    currentCarbonG: Math.round(currentCarbonG),
    bestCarbonG: Math.round(bestCarbonG),
  }
}

/**
 * Format the nudge message.
 */
export function formatNudgeMessage(
  durationMinutes: number,
  currentCarbonG: number,
  bestHour: number,
  bestCarbonG: number,
  savingsPct: number,
): string {
  const currentHour = new Date().getHours()
  const bestTimeHour = (currentHour + bestHour) % 24
  const bestTimeStr = `${bestTimeHour}:00`
  return `This ${durationMinutes}-min session = ${currentCarbonG}g now. Shift to ${bestTimeStr} = ${bestCarbonG}g (-${savingsPct}%).`
}

/**
 * Check if a nudge cooldown is active for the given activity type.
 * Cooldown is 2 hours after dismissal.
 */
export function isNudgeCooledDown(
  cooldowns: Record<string, number> | undefined,
  activityType: string,
  now: number = Date.now(),
): boolean {
  if (!cooldowns) return false
  const dismissedAt = cooldowns[activityType]
  if (!dismissedAt) return false
  const twoHoursMs = 2 * 60 * 60 * 1000
  return (now - dismissedAt) < twoHoursMs
}
