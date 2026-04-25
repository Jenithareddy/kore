// src/popup/panels/BreakdownPanel.tsx
// Activity breakdown with autoplay as a distinct line item

import React from 'react'
import { useAggregates } from '../hooks/useAggregates'
import { formatCarbon } from '../../floating-badge/FloatingBadge'

interface BreakdownItem {
  label: string
  value: number
  testId: string
}

export function computeBreakdownPercentages(items: BreakdownItem[]): Array<BreakdownItem & { pct: number }> {
  const total = items.reduce((sum, i) => sum + i.value, 0)
  return items.map(i => ({
    ...i,
    pct: total > 0 ? (i.value / total) * 100 : 0,
  }))
}

export function BreakdownPanel() {
  const { thirtyDay, loading } = useAggregates()

  if (loading) {
    return <div className="ww-panel" data-testid="breakdown-panel"><p>Loading…</p></div>
  }

  const agg = thirtyDay
  const items: BreakdownItem[] = [
    { label: 'Video (user)', value: agg?.videoUserGCO2e ?? 0, testId: 'breakdown-video-user' },
    { label: 'Video (autoplay)', value: agg?.videoAutoplayGCO2e ?? 0, testId: 'breakdown-video-autoplay' },
    { label: 'AI prompts', value: agg?.aiPromptGCO2e ?? 0, testId: 'breakdown-ai' },
    { label: 'Video calls', value: agg?.videoCallGCO2e ?? 0, testId: 'breakdown-calls' },
    { label: 'Page loads', value: agg?.pageLoadGCO2e ?? 0, testId: 'breakdown-pages' },
  ]

  const withPct = computeBreakdownPercentages(items)

  return (
    <div className="ww-panel" data-testid="breakdown-panel">
      <h3>Activity Breakdown (30d)</h3>
      <div className="ww-breakdown-bar">
        {withPct.filter(i => i.pct > 0).map(item => (
          <div
            key={item.testId}
            className="ww-breakdown-segment"
            style={{
              width: `${item.pct}%`,
              background: item.testId === 'breakdown-video-user' ? '#4ade80'
                : item.testId === 'breakdown-video-autoplay' ? '#facc15'
                : item.testId === 'breakdown-ai' ? '#a78bfa'
                : item.testId === 'breakdown-calls' ? '#22d3ee'
                : '#6b7280',
            }}
          />
        ))}
      </div>
      {withPct.map(item => (
        <div className="ww-stat" key={item.testId} data-testid={item.testId}>
          <span className="ww-stat-label">{item.label}</span>
          <span className="ww-stat-value">
            {formatCarbon(item.value)} ({item.pct.toFixed(1)}%)
          </span>
        </div>
      ))}
    </div>
  )
}
