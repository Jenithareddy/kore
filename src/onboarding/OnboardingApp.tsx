import React, { useState } from 'react'
import { setSetting } from '../db'
import { RegionSelector } from '../components/RegionSelector'
import './onboarding.css'

type Screen = 'permissions' | 'region' | 'privacy'

export function OnboardingApp() {
  const [screen, setScreen] = useState<Screen>('permissions')
  const [regionCode, setRegionCode] = useState('')

  const handleComplete = async () => {
    if (regionCode.trim()) {
      await setSetting('region', regionCode.trim())
    }
    await setSetting('onboardingComplete', true)
    // Close the onboarding tab
    window.close()
  }

  return (
    <div className="ob-container">
      <div className="ob-header">
        <img src={chrome.runtime.getURL('assets/Bandwattt.png')} alt="BandWatt" style={{ height: '60px', marginBottom: '8px' }} />
        <div className="ob-progress">
          <div className={`ob-dot ${screen === 'permissions' ? 'active' : screen !== 'permissions' ? 'done' : ''}`} />
          <div className={`ob-dot ${screen === 'region' ? 'active' : screen === 'privacy' ? 'done' : ''}`} />
          <div className={`ob-dot ${screen === 'privacy' ? 'active' : ''}`} />
        </div>
      </div>

      {/* Screen 1: Permissions */}
      {screen === 'permissions' && (
        <div className="ob-screen" data-testid="screen-permissions">
          <h2>What BandWatt needs</h2>
          <p>BandWatt requests a few browser permissions to track your digital carbon footprint:</p>
          <ul className="ob-list">
            <li>
              <strong>Active tab access</strong> — to detect video playback and AI prompt submissions on YouTube, Netflix, ChatGPT, Claude, and Gemini
            </li>
            <li>
              <strong>Storage</strong> — to save your carbon history locally in your browser (never sent anywhere)
            </li>
            <li>
              <strong>Alarms</strong> — to keep the tracker running and clean up old data
            </li>
            <li>
              <strong>Notifications</strong> — to remind you about lower-carbon time windows (optional, you can dismiss)
            </li>
          </ul>
          <p className="ob-note">No browsing history, page content, or personal data is ever collected or transmitted.</p>
          <div className="ob-actions">
            <button className="ob-btn-primary" onClick={() => setScreen('region')} data-testid="next-to-region">
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Screen 2: Region selection */}
      {screen === 'region' && (
        <div className="ob-screen" data-testid="screen-region">
          <h2>Set your electricity region</h2>
          <p>
            Your region determines how "dirty" your local electricity grid is right now.
            This makes your carbon estimates accurate to your location.
          </p>
          <div className="ob-input-group">
            <label>Select your electricity region</label>
            <RegionSelector value={regionCode} onChange={setRegionCode} />
            <p className="ob-hint">
              Search by state name (e.g., &quot;California&quot;, &quot;Texas&quot;) or region name
            </p>
          </div>
          <p className="ob-note">
            You can skip this — BandWatt will use the global average (475 gCO₂e/kWh) until you set a region.
          </p>
          <div className="ob-actions">
            <button className="ob-btn-secondary" onClick={() => setScreen('permissions')} data-testid="back-to-permissions">
              ← Back
            </button>
            <button className="ob-btn-primary" onClick={() => setScreen('privacy')} data-testid="next-to-privacy">
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Screen 3: Privacy statement */}
      {screen === 'privacy' && (
        <div className="ob-screen" data-testid="screen-privacy">
          <h2>Your privacy is absolute</h2>
          <div className="ob-privacy-box">
            <h3>What NEVER leaves your device:</h3>
            <ul>
              <li>Browsing history and page URLs</li>
              <li>Video titles or content</li>
              <li>AI prompt text</li>
              <li>Your IP address or precise location</li>
              <li>Any personal information</li>
            </ul>
          </div>
          <div className="ob-privacy-box ob-privacy-allowed">
            <h3>The only outbound data:</h3>
            <ul>
              <li>Your region code (e.g. &quot;US-CAL-CISO&quot;) → sent to <code>api.electricitymap.org</code></li>
              <li>Your region code → sent to <code>api.eia.gov</code> (US fallback)</li>
            </ul>
            <p>That&apos;s it. Two API calls, region code only, cached for 15 minutes.</p>
          </div>
          <div className="ob-actions">
            <button className="ob-btn-secondary" onClick={() => setScreen('region')} data-testid="back-to-region">
              ← Back
            </button>
            <button className="ob-btn-primary" onClick={handleComplete} data-testid="get-started">
              Get started 🌱
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
