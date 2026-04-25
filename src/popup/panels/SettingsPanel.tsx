// src/popup/panels/SettingsPanel.tsx
// Region code, category toggles, violations log, clear data

import React, { useState, useEffect } from 'react'
import { useSettings } from '../hooks/useSettings'
import { db, type ViolationRecord } from '../../db'
import { RegionSelector } from '../../components/RegionSelector'

interface Categories {
  video: boolean
  ai: boolean
  pageLoad: boolean
}

export function SettingsPanel() {
  const { value: region, setValue: setRegionSetting, loading: loadingRegion } = useSettings<string>('region', '')
  const { value: categories, setValue: setCategories, loading: loadingCat } = useSettings<Categories>('categories', { video: true, ai: true, pageLoad: true })

  const [violations, setViolations] = useState<ViolationRecord[]>([])
  const [clearing, setClearing] = useState(false)

  // Load violations
  useEffect(() => {
    db.violations.toArray().then(setViolations)
  }, [])

  const unacknowledged = violations.filter(v => !v.acknowledged)

  const handleRegionChange = (code: string) => {
    setRegionSetting(code)
    chrome.runtime.sendMessage({ type: 'SET_REGION', payload: { regionCode: code } })
  }

  const handleToggleCategory = (key: keyof Categories) => {
    const updated = { ...categories, [key]: !categories[key] }
    setCategories(updated)
  }

  const handleAcknowledge = async (id: number) => {
    await db.violations.update(id, { acknowledged: true })
    setViolations(prev => prev.map(v => v.id === id ? { ...v, acknowledged: true } : v))
  }

  const handleClearData = async () => {
    setClearing(true)
    chrome.runtime.sendMessage({ type: 'CLEAR_DATA' }, () => {
      setClearing(false)
      setViolations([])
    })
  }

  if (loadingRegion || loadingCat) {
    return <div className="ww-panel" data-testid="settings-panel"><p>Loading…</p></div>
  }

  return (
    <div data-testid="settings-panel">
      {/* Non-dismissable violation banner */}
      {unacknowledged.length > 0 && (
        <div className="ww-violation-banner" data-testid="violation-banner">
          ⚠️ {unacknowledged.length} unacknowledged Ethics Gate violation{unacknowledged.length > 1 ? 's' : ''}.
          Review below.
        </div>
      )}

      {/* Region */}
      <div className="ww-settings-section">
        <h3 style={{ margin: '0 0 8px', fontSize: 12, textTransform: 'uppercase', color: '#888', letterSpacing: '0.5px' }}>Region</h3>
        <RegionSelector
          value={region}
          onChange={handleRegionChange}
          compact
        />
      </div>

      {/* Category toggles */}
      <div className="ww-settings-section">
        <h3 style={{ margin: '0 0 8px', fontSize: 12, textTransform: 'uppercase', color: '#888', letterSpacing: '0.5px' }}>Activity Categories</h3>
        <label>
          <span>Video streaming</span>
          <input
            type="checkbox"
            checked={categories.video}
            onChange={() => handleToggleCategory('video')}
            data-testid="toggle-video"
          />
        </label>
        <label>
          <span>AI prompts</span>
          <input
            type="checkbox"
            checked={categories.ai}
            onChange={() => handleToggleCategory('ai')}
            data-testid="toggle-ai"
          />
        </label>
        <label>
          <span>Page loads</span>
          <input
            type="checkbox"
            checked={categories.pageLoad}
            onChange={() => handleToggleCategory('pageLoad')}
            data-testid="toggle-pageload"
          />
        </label>
      </div>

      {/* Violations log */}
      <div className="ww-settings-section">
        <h3 style={{ margin: '0 0 8px', fontSize: 12, textTransform: 'uppercase', color: '#888', letterSpacing: '0.5px' }}>Ethics Gate Violations</h3>
        {violations.length === 0 ? (
          <p style={{ color: '#555', fontSize: 12 }}>No violations recorded.</p>
        ) : (
          <div data-testid="violations-list">
            {violations.map(v => (
              <div key={v.id} style={{ padding: '6px 0', borderBottom: '1px solid #222', fontSize: 12 }} data-testid={`violation-${v.id}`}>
                <div style={{ color: '#ef4444' }}><strong>{v.ruleViolated}</strong></div>
                <div style={{ color: '#666' }}>{v.blockedDestination} — {new Date(v.timestamp).toLocaleString()}</div>
                {!v.acknowledged && (
                  <button
                    onClick={() => handleAcknowledge(v.id!)}
                    style={{ marginTop: 4, fontSize: 11, padding: '2px 8px', cursor: 'pointer', background: '#333', color: '#e0e0e0', border: '1px solid #444', borderRadius: 3 }}
                    data-testid={`ack-${v.id}`}
                  >
                    Acknowledge
                  </button>
                )}
                {v.acknowledged && <span style={{ color: '#4ade80', fontSize: 11 }}> ✓ Acknowledged</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clear data */}
      <div className="ww-settings-section">
        <button
          className="ww-btn ww-btn-danger"
          onClick={handleClearData}
          disabled={clearing}
          data-testid="clear-data-btn"
        >
          {clearing ? 'Clearing…' : 'Clear All Data'}
        </button>
      </div>
    </div>
  )
}
