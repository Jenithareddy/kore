import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { evaluateNudge, isNudgeCooledDown, formatNudgeMessage } from './scheduler-nudge'
import type { HourlyForecast, GridConfidence } from './grid-client'

// Property 13: Nudge fires iff 30% savings window exists AND confidence is medium/high
// **Validates: Requirements 6.1, 6.2, 6.6**
describe('Property 13: Scheduler nudge fires iff 30% savings window exists', () => {
  it('nudge fires when savings >= 30% and confidence is medium or high', () => {
    fc.assert(
      fc.property(
        // Current intensity
        fc.float({ min: 100, max: 800, noNaN: true }),
        // Best future intensity (must be < 70% of current for 30% savings)
        fc.float({ min: 10, max: 500, noNaN: true }),
        fc.constantFrom('medium', 'high') as fc.Arbitrary<GridConfidence>,
        fc.integer({ min: 20, max: 180 }),
        (currentIntensity, bestIntensity, confidence, durationMin) => {
          // Ensure best is actually lower enough for >= 30% savings
          const actualBest = Math.min(bestIntensity, currentIntensity * 0.65)
          const forecast: HourlyForecast[] = [
            { hour: 0, gCO2ePerKWh: currentIntensity, source: 'electricitymaps', confidence },
            ...Array.from({ length: 23 }, (_, i) => ({
              hour: i + 1,
              gCO2ePerKWh: i === 5 ? actualBest : currentIntensity,
              source: 'electricitymaps' as const,
              confidence,
            })),
          ]
          const result = evaluateNudge(forecast, durationMin, confidence)
          const expectedSavings = ((currentIntensity - actualBest) / currentIntensity) * 100
          if (expectedSavings >= 30) {
            expect(result.shouldNudge).toBe(true)
          }
        },
      ),
    )
  })

  it('nudge does NOT fire when confidence is low', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 100, max: 800, noNaN: true }),
        fc.integer({ min: 20, max: 180 }),
        (currentIntensity, durationMin) => {
          const forecast: HourlyForecast[] = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            gCO2ePerKWh: i === 0 ? currentIntensity : currentIntensity * 0.3,
            source: 'static_fallback' as const,
            confidence: 'low' as const,
          }))
          const result = evaluateNudge(forecast, durationMin, 'low')
          expect(result.shouldNudge).toBe(false)
        },
      ),
    )
  })

  it('nudge does NOT fire when savings < 30%', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 100, max: 800, noNaN: true }),
        fc.constantFrom('medium', 'high') as fc.Arbitrary<GridConfidence>,
        fc.integer({ min: 20, max: 180 }),
        (currentIntensity, confidence, durationMin) => {
          // All future hours have at most 15% savings
          const futureIntensity = currentIntensity * 0.85
          const forecast: HourlyForecast[] = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            gCO2ePerKWh: i === 0 ? currentIntensity : futureIntensity,
            source: 'electricitymaps' as const,
            confidence,
          }))
          const result = evaluateNudge(forecast, durationMin, confidence)
          expect(result.shouldNudge).toBe(false)
        },
      ),
    )
  })

  it('nudge fires iff savings >= 30% (bidirectional check)', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 50, max: 800, noNaN: true }),
        fc.float({ min: 1, max: 800, noNaN: true }),
        fc.constantFrom('medium', 'high') as fc.Arbitrary<GridConfidence>,
        fc.integer({ min: 20, max: 180 }),
        (currentIntensity, bestFutureIntensity, confidence, durationMin) => {
          const forecast: HourlyForecast[] = [
            { hour: 0, gCO2ePerKWh: currentIntensity, source: 'electricitymaps', confidence },
            ...Array.from({ length: 23 }, (_, i) => ({
              hour: i + 1,
              gCO2ePerKWh: i === 5 ? bestFutureIntensity : currentIntensity,
              source: 'electricitymaps' as const,
              confidence,
            })),
          ]
          const result = evaluateNudge(forecast, durationMin, confidence)
          const actualBest = Math.min(bestFutureIntensity, currentIntensity)
          const savingsPct = currentIntensity > 0
            ? ((currentIntensity - actualBest) / currentIntensity) * 100
            : 0

          if (savingsPct >= 30) {
            expect(result.shouldNudge).toBe(true)
          } else {
            expect(result.shouldNudge).toBe(false)
          }
        },
      ),
    )
  })
})

// Property 14: Nudge cooldown prevents repeat nudges within 2 hours
// **Validates: Requirements 6.4**
describe('Property 14: Nudge cooldown prevents repeat nudges within 2 hours', () => {
  it('cooldown is active within 2 hours of dismissal', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 * 60 * 60 * 1000 - 1 }),
        (elapsedMs) => {
          const now = 1700000000000
          const dismissedAt = now - elapsedMs
          const cooldowns = { video_streaming: dismissedAt }
          expect(isNudgeCooledDown(cooldowns, 'video_streaming', now)).toBe(true)
        },
      ),
    )
  })

  it('cooldown expires after 2 hours', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2 * 60 * 60 * 1000, max: 24 * 60 * 60 * 1000 }),
        (elapsedMs) => {
          const now = 1700000000000
          const dismissedAt = now - elapsedMs
          const cooldowns = { video_streaming: dismissedAt }
          expect(isNudgeCooledDown(cooldowns, 'video_streaming', now)).toBe(false)
        },
      ),
    )
  })

  it('no cooldown when no dismissal recorded', () => {
    expect(isNudgeCooledDown({}, 'video_streaming')).toBe(false)
    expect(isNudgeCooledDown(undefined, 'video_streaming')).toBe(false)
  })

  it('cooldown is per-activity-type', () => {
    const now = Date.now()
    const cooldowns = { video_streaming: now }
    expect(isNudgeCooledDown(cooldowns, 'video_streaming', now)).toBe(true)
    expect(isNudgeCooledDown(cooldowns, 'ai_prompt', now)).toBe(false)
  })
})

describe('formatNudgeMessage', () => {
  it('formats the message correctly', () => {
    const msg = formatNudgeMessage(90, 82, 6, 36, 56)
    expect(msg).toContain('90-min')
    expect(msg).toContain('82g')
    expect(msg).toContain('36g')
    expect(msg).toContain('-56%')
  })
})
