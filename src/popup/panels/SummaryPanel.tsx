import React, { useState, useEffect } from 'react'
import { useAggregates } from '../hooks/useAggregates'
import { formatCarbon } from '../../floating-badge/FloatingBadge'

interface VideoContext {
  platform: string
  quality: string
  durationMinutes: number
  currentCarbonG: number
  gridIntensity: number
  lowerQuality: string
  lowerCarbonG: number
  qualitySavingsPct: number
  bestHour: number
  bestHourCarbonG: number
  bestHourIntensity: number
  timeSavingsPct: number
  googleSearches: number
  phoneCharges: number
  milesNotDriven: number
}

export function SummaryPanel() {
  const { session, today, sevenDay, thirtyDay, loading } = useAggregates()
  const [videoCtx, setVideoCtx] = useState<VideoContext | null>(null)

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_VIDEO_CONTEXT' }, (response) => {
      if (response?.videoContext) setVideoCtx(response.videoContext)
    })
  }, [])

  if (loading) {
    return <div className="ww-panel" data-testid="summary-panel"><p>Loading…</p></div>
  }

  // If a video is playing/was just detected, show video-focused view
  if (videoCtx) {
    return (
      <>
        {/* Hero: video carbon prediction */}
        <div className="ww-panel" data-testid="video-hero">
          <div style={{ textAlign: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              {videoCtx.platform} · {videoCtx.quality} · {videoCtx.durationMinutes} min
            </span>
          </div>
          <div className="ww-big-number">{formatCarbon(videoCtx.currentCarbonG)}</div>
          <div className="ww-big-number-label">estimated CO₂ for this video</div>
        </div>

        {/* Analogies */}
        <div className="ww-panel" data-testid="analogies">
          <h3>That's equivalent to</h3>
          <div className="ww-stat">
            <span className="ww-stat-label">🔍 Google searches</span>
            <span className="ww-stat-value">{videoCtx.googleSearches}</span>
          </div>
          <div className="ww-stat">
            <span className="ww-stat-label">🔋 Phone charges</span>
            <span className="ww-stat-value">{videoCtx.phoneCharges}</span>
          </div>
          {videoCtx.milesNotDriven >= 0.01 && (
            <div className="ww-stat">
              <span className="ww-stat-label">🚗 Miles not driven</span>
              <span className="ww-stat-value">{videoCtx.milesNotDriven}</span>
            </div>
          )}
        </div>

        {/* Savings: quality */}
        {videoCtx.qualitySavingsPct > 0 && videoCtx.lowerQuality !== videoCtx.quality && (
          <div className="ww-panel" data-testid="quality-savings" style={{ borderColor: '#4ade80' }}>
            <h3>💡 Save by lowering quality</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
              <div>
                <div style={{ color: '#e0e0e0', fontSize: 14 }}>
                  Switch to <span style={{ color: '#4ade80', fontWeight: 700 }}>{videoCtx.lowerQuality}</span>
                </div>
                <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                  {formatCarbon(videoCtx.lowerCarbonG)} instead of {formatCarbon(videoCtx.currentCarbonG)}
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#4ade80' }}>
                -{videoCtx.qualitySavingsPct}%
              </div>
            </div>
          </div>
        )}

        {/* Savings: time shift */}
        {videoCtx.timeSavingsPct > 5 && (
          <div className="ww-panel" data-testid="time-savings" style={{ borderColor: '#facc15' }}>
            <h3>⏰ Save by shifting time</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
              <div>
                <div style={{ color: '#e0e0e0', fontSize: 14 }}>
                  Watch at <span style={{ color: '#facc15', fontWeight: 700 }}>{videoCtx.bestHour}:00</span> instead
                </div>
                <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                  {formatCarbon(videoCtx.bestHourCarbonG)} instead of {formatCarbon(videoCtx.currentCarbonG)}
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#facc15' }}>
                -{videoCtx.timeSavingsPct}%
              </div>
            </div>
          </div>
        )}

        {/* Session totals (compact) */}
        <div className="ww-panel">
          <h3>Session totals</h3>
          <div className="ww-stat">
            <span className="ww-stat-label">This hour</span>
            <span className="ww-stat-value" data-testid="session-total">{formatCarbon(session?.totalGCO2e ?? 0)}</span>
          </div>
          <div className="ww-stat">
            <span className="ww-stat-label">Today</span>
            <span className="ww-stat-value" data-testid="today-total">{formatCarbon(today?.totalGCO2e ?? 0)}</span>
          </div>
          <div className="ww-stat">
            <span className="ww-stat-label">30-day</span>
            <span className="ww-stat-value" data-testid="30day-total">{formatCarbon(thirtyDay?.totalGCO2e ?? 0)}</span>
          </div>
        </div>
      </>
    )
  }

  // No video playing — show standard summary
  return (
    <div className="ww-panel" data-testid="summary-panel">
      <h3>Carbon Summary</h3>
      <div style={{ textAlign: 'center', padding: '16px 0 8px', color: '#555', fontSize: 12 }}>
        Play a video on YouTube or Netflix to see its carbon impact
      </div>
      <div className="ww-stat">
        <span className="ww-stat-label">This hour</span>
        <span className="ww-stat-value" data-testid="session-total">{formatCarbon(session?.totalGCO2e ?? 0)}</span>
      </div>
      <div className="ww-stat">
        <span className="ww-stat-label">Today</span>
        <span className="ww-stat-value" data-testid="today-total">{formatCarbon(today?.totalGCO2e ?? 0)}</span>
      </div>
      <div className="ww-stat">
        <span className="ww-stat-label">7-day</span>
        <span className="ww-stat-value" data-testid="7day-total">{formatCarbon(sevenDay?.totalGCO2e ?? 0)}</span>
      </div>
      <div className="ww-stat">
        <span className="ww-stat-label">30-day</span>
        <span className="ww-stat-value" data-testid="30day-total">{formatCarbon(thirtyDay?.totalGCO2e ?? 0)}</span>
      </div>
    </div>
  )
}
