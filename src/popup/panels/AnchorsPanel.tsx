// src/popup/panels/AnchorsPanel.tsx
// Comparison anchors — selects the 2 most relatable anchors using log10 scoring

import React from 'react'
import { useAggregates } from '../hooks/useAggregates'
import { toComparisonAnchors } from '../../carbon-calculator'

interface AnchorDisplay {
  label: string
  value: number
  key: string
}

/**
 * Select the two most relatable anchors using log10 scoring.
 * Lower score = closer to 1.0 = most relatable.
 */
export function selectBestAnchors(gCO2e: number): AnchorDisplay[] {
  if (gCO2e <= 0) return []

  const anchors = toComparisonAnchors(gCO2e)
  const all: AnchorDisplay[] = [
    { label: 'Google searches', value: anchors.googleSearches, key: 'google' },
    { label: 'miles not driven', value: anchors.milesNotDriven, key: 'miles' },
    { label: 'phone charges', value: anchors.phoneCharges, key: 'phone' },
    { label: 'kettles boiled', value: anchors.kettlesBoiled, key: 'kettle' },
  ]

  // Score each anchor: abs(log10(value)) — lower is more relatable
  const scored = all
    .filter(a => a.value > 0 && isFinite(a.value))
    .map(a => ({ ...a, score: Math.abs(Math.log10(a.value)) }))
    .sort((a, b) => a.score - b.score)

  return scored.slice(0, 2)
}

export function AnchorsPanel() {
  const { thirtyDay, loading } = useAggregates()

  if (loading) {
    return <div className="ww-panel" data-testid="anchors-panel"><p>Loading…</p></div>
  }

  const total = thirtyDay?.totalGCO2e ?? 0

  if (total <= 0) {
    return (
      <div className="ww-panel" data-testid="anchors-panel">
        <h3>In Real Terms</h3>
        <p style={{ color: '#888' }}>0 g CO₂</p>
      </div>
    )
  }

  const best = selectBestAnchors(total)

  return (
    <div className="ww-panel" data-testid="anchors-panel">
      <h3>In Real Terms (30d)</h3>
      {best.map(a => (
        <div className="ww-stat" key={a.key} data-testid={`anchor-${a.key}`}>
          <span className="ww-stat-value">
            {a.value.toFixed(1)} {a.label}
          </span>
        </div>
      ))}
    </div>
  )
}
