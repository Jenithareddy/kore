import React, { useState, useEffect } from 'react'
import { formatCarbon } from '../../floating-badge/FloatingBadge'

interface HourData {
  hour: number
  intensity: number
  videoCarbonG: number
}

interface VideoContext {
  platform: string
  quality: string
  durationMinutes: number
  currentCarbonG: number
  bestHour: number
  bestHourCarbonG: number
  forecast: HourData[]
}

export function GridSchedulePanel() {
  const [videoCtx, setVideoCtx] = useState<VideoContext | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_VIDEO_CONTEXT' }, (response) => {
      if (response?.videoContext) setVideoCtx(response.videoContext)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <div className="ww-panel"><p>Loading…</p></div>
  }

  if (!videoCtx || !videoCtx.forecast?.length) {
    return (
      <div className="ww-panel" data-testid="grid-panel">
        <h3>24-Hour Grid Forecast</h3>
        <p style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>
          Play a video to see how its carbon cost changes by hour
        </p>
      </div>
    )
  }

  const { forecast } = videoCtx
  const maxCarbon = Math.max(...forecast.map(f => f.videoCarbonG))
  const minCarbon = Math.min(...forecast.map(f => f.videoCarbonG))
  const currentHourData = forecast[0]

  return (
    <>
      {/* Current vs best comparison */}
      <div className="ww-panel" data-testid="grid-comparison">
        <h3>This {videoCtx.durationMinutes}-min {videoCtx.quality} video</h3>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <div style={{ flex: 1, background: '#222', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>NOW</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>
              {formatCarbon(videoCtx.currentCarbonG)}
            </div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
              {currentHourData?.intensity} gCO₂e/kWh
            </div>
          </div>
          <div style={{ flex: 1, background: '#0a1a0a', border: '1px solid #2a4a2a', borderRadius: 8, padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>AT {videoCtx.bestHour}:00</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#4ade80' }}>
              {formatCarbon(videoCtx.bestHourCarbonG)}
            </div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
              {forecast.find(f => f.hour === videoCtx.bestHour)?.intensity ?? '—'} gCO₂e/kWh
            </div>
          </div>
        </div>
      </div>

      {/* Hourly bars showing video carbon at each hour */}
      <div className="ww-panel" data-testid="grid-panel">
        <h3>Video CO₂ by hour</h3>
        <div className="ww-grid-bar" data-testid="grid-bars">
          {forecast.map((f) => {
            const heightPct = maxCarbon > 0 ? (f.videoCarbonG / maxCarbon) * 100 : 0
            const isLowest = f.videoCarbonG === minCarbon
            const isCurrent = f === forecast[0]
            return (
              <div
                key={f.hour}
                className={`ww-grid-bar-item${isLowest ? ' lowest' : ''}`}
                style={{
                  height: `${Math.max(heightPct, 3)}%`,
                  background: isCurrent ? '#ef4444' : isLowest ? '#facc15' : '#333',
                }}
                title={`${f.hour}:00 — ${f.videoCarbonG}g CO₂ (${f.intensity} gCO₂e/kWh)`}
                data-testid={`grid-bar-${f.hour}`}
              />
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#555', marginTop: 4 }}>
          <span>{forecast[0]?.hour}:00</span>
          <span style={{ display: 'flex', gap: 12 }}>
            <span><span style={{ color: '#ef4444' }}>■</span> now</span>
            <span><span style={{ color: '#facc15' }}>■</span> best</span>
            <span><span style={{ color: '#333' }}>■</span> other</span>
          </span>
          <span>{forecast[forecast.length - 1]?.hour}:00</span>
        </div>
      </div>

      {/* Quality comparison for this video */}
      <div className="ww-panel" data-testid="grid-quality">
        <h3>Same video, different quality</h3>
        {(['480p', '720p', '1080p', '4K'] as const).map(q => {
          // Rough estimate: scale by data rate ratio
          const rates: Record<string, number> = { '480p': 0.5, '720p': 1.5, '1080p': 3.0, '4K': 7.0 }
          const currentRate = rates[videoCtx.quality] ?? 3.0
          const thisRate = rates[q]
          const estimatedCarbon = (videoCtx.currentCarbonG / currentRate) * thisRate
          const isCurrent = q === videoCtx.quality
          return (
            <div className="ww-stat" key={q}>
              <span className="ww-stat-label" style={{ color: isCurrent ? '#4ade80' : '#888' }}>
                {q} {isCurrent ? '(current)' : ''}
              </span>
              <span className="ww-stat-value" style={{ color: isCurrent ? '#4ade80' : '#e0e0e0' }}>
                {formatCarbon(Math.round(estimatedCarbon * 10) / 10)}
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}
