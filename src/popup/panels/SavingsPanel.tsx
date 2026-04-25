// src/popup/panels/SavingsPanel.tsx
// Quality-tier savings counter — only shown when quality comparison is enabled

import React from 'react'
import { useSettings } from '../hooks/useSettings'
import { formatCarbon } from '../../floating-badge/FloatingBadge'
import { selectBestAnchors } from './AnchorsPanel'

export function SavingsPanel() {
  const { value: qualityComparisonEnabled, loading: loadingEnabled } = useSettings<boolean>('qualityComparisonEnabled', false)
  const { value: savings, loading: loadingSavings } = useSettings<number>('savings', 0)

  if (loadingEnabled || loadingSavings) {
    return null
  }

  if (!qualityComparisonEnabled) {
    return null
  }

  const anchors = savings > 0 ? selectBestAnchors(savings) : []
  const anchorText = anchors.length > 0
    ? ` — that's ${anchors[0].value.toFixed(1)} ${anchors[0].label}`
    : ''

  return (
    <div className="ww-panel" data-testid="savings-panel">
      <h3>Savings</h3>
      <div className="ww-stat">
        <span className="ww-stat-label">CO₂ avoided</span>
        <span className="ww-stat-value" data-testid="savings-total">
          {formatCarbon(savings)}
        </span>
      </div>
      {anchorText && (
        <p style={{ fontSize: 11, color: '#555', margin: '4px 0 0' }} data-testid="savings-anchor">
          You've saved {formatCarbon(savings)}{anchorText}
        </p>
      )}
    </div>
  )
}
