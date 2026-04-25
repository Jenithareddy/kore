// src/floating-badge/FloatingBadge.tsx
import React, { useState, useCallback, useRef, useEffect } from 'react'
import type { QualityTier } from '../carbon-calculator'

export interface BadgeProps {
  sessionCarbonG: number
  autoplayCarbonG: number
  comparisonQuality?: {
    current: QualityTier
    lower: QualityTier
    lowerG: number
  }
  videoPreview?: {
    durationMinutes: number
    quality: string
    predictedCarbonG: number
    lowerQuality: string
    lowerCarbonG: number
    qualitySavingsPct: number
    bestHour: number
    bestHourCarbonG: number
    timeSavingsPct: number
    googleSearches: number
  }
}

export function formatCarbon(grams: number): string {
  if (grams >= 100) {
    return `${(grams / 1000).toFixed(2)} kg`
  }
  return `${grams.toFixed(1)} g`
}

export function FloatingBadge({ sessionCarbonG, autoplayCarbonG, comparisonQuality, videoPreview }: BadgeProps) {
  const [dismissed, setDismissed] = useState(false)
  const [autoplayShown, setAutoplayShown] = useState(false)
  const [position, setPosition] = useState({ x: 20, y: 20 })
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  // Show autoplay indicator once when threshold is crossed.
  // Once shown, it stays visible for the rest of the tab session.
  useEffect(() => {
    if (autoplayCarbonG > 10 && !autoplayShown) {
      setAutoplayShown(true)
    }
  }, [autoplayCarbonG, autoplayShown])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y }
    e.preventDefault()
  }, [position])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setPosition({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y })
    }
    const onMouseUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  if (dismissed) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: position.y,
        right: position.x,
        zIndex: 2147483647,
        background: 'rgba(13, 13, 13, 0.95)',
        color: '#e0e0e0',
        borderRadius: '14px',
        padding: videoPreview ? '14px 18px' : '10px 14px',
        fontSize: '13px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        cursor: 'move',
        userSelect: 'none',
        boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        border: '1px solid #2a2a2a',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        minWidth: videoPreview ? '240px' : '130px',
        maxWidth: '300px',
      }}
      onMouseDown={onMouseDown}
      data-testid="wattwise-badge"
    >
      {videoPreview ? (
        <>
          {/* Video prediction */}
          <div style={{ borderBottom: '1px solid #2a2a2a', paddingBottom: 6 }}>
            <div style={{ fontSize: 12, color: '#facc15', fontWeight: 600 }}>
              🎬 This {videoPreview.durationMinutes}-min video
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80', margin: '2px 0' }}>
              ≈ {formatCarbon(videoPreview.predictedCarbonG)}
            </div>
            <div style={{ fontSize: 11, color: '#888' }}>
              ≈ {videoPreview.googleSearches} Google searches
            </div>
          </div>

          {/* Quality suggestion */}
          {videoPreview.qualitySavingsPct > 0 && videoPreview.lowerQuality !== videoPreview.quality && (
            <div style={{ fontSize: 12, padding: '2px 0' }}>
              <span style={{ color: '#4ade80' }}>💡 {videoPreview.lowerQuality}</span>
              <span style={{ color: '#888' }}> → save </span>
              <span style={{ color: '#4ade80', fontWeight: 600 }}>{videoPreview.qualitySavingsPct}%</span>
              <div style={{ fontSize: 10, color: '#555' }}>
                {formatCarbon(videoPreview.lowerCarbonG)} instead of {formatCarbon(videoPreview.predictedCarbonG)}
              </div>
            </div>
          )}

          {/* Time suggestion */}
          {videoPreview.timeSavingsPct > 5 && (
            <div style={{ fontSize: 12, padding: '2px 0' }}>
              <span style={{ color: '#facc15' }}>⏰ {videoPreview.bestHour}:00</span>
              <span style={{ color: '#888' }}> → save </span>
              <span style={{ color: '#facc15', fontWeight: 600 }}>{videoPreview.timeSavingsPct}%</span>
              <div style={{ fontSize: 10, color: '#555' }}>
                {formatCarbon(videoPreview.bestHourCarbonG)} instead of {formatCarbon(videoPreview.predictedCarbonG)}
              </div>
            </div>
          )}

          {/* Session total */}
          <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: 4, fontSize: 11, color: '#666', textAlign: 'center' }}>
            Session: <span style={{ color: '#4ade80' }}>{formatCarbon(sessionCarbonG)}</span>
          </div>
        </>
      ) : (
        /* No video — compact display */
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: '#4ade80' }}>CO₂</span>
          <span data-testid="carbon-value" style={{ color: '#4ade80', fontSize: 15, fontWeight: 600 }}>{formatCarbon(sessionCarbonG)}</span>
        </div>
      )}

      {/* Autoplay indicator */}
      {autoplayShown && (
        <div style={{ fontSize: '11px', color: '#facc15' }} data-testid="autoplay-indicator">
          {formatCarbon(autoplayCarbonG)} from autoplay
        </div>
      )}

      {/* Dismiss button */}
      <button
        onClick={(e) => { e.stopPropagation(); setDismissed(true) }}
        style={{
          position: 'absolute', top: '4px', right: '8px',
          background: 'none', border: 'none', color: '#555',
          cursor: 'pointer', fontSize: '14px', padding: '2px',
        }}
        aria-label="Dismiss BandWatt badge"
        data-testid="dismiss-button"
      >
        ✕
      </button>
    </div>
  )
}
