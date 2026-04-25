// src/popup/App.tsx — main app component with tab navigation

import React, { useState, useEffect } from 'react'
import { SummaryPanel } from './panels/SummaryPanel'
import { ChartPanel } from './panels/ChartPanel'
import { BreakdownPanel } from './panels/BreakdownPanel'
import { GridSchedulePanel } from './panels/GridSchedulePanel'
import { SettingsPanel } from './panels/SettingsPanel'
import { getSetting } from '../db'
import './styles.css'

type Tab = 'overview' | 'grid' | 'history' | 'settings'

export function App() {
  const [tab, setTab] = useState<Tab>('overview')
  const [onboardingComplete, setOnboardingComplete] = useState(true)

  useEffect(() => {
    getSetting<boolean>('onboardingComplete').then(v => setOnboardingComplete(v ?? false))
  }, [])

  return (
    <div className="ww-popup">
      {/* Header */}
      <div className="ww-header">
        <img src={chrome.runtime.getURL('assets/Bandwattt.png')} alt="BandWatt" />
        <span className="ww-header-title">BandWatt</span>
      </div>

      {/* Incomplete onboarding prompt */}
      {!onboardingComplete && (
        <div className="ww-setup-prompt" data-testid="setup-prompt">
          <span>⚠️ Complete setup to get localized carbon data</span>
          <button onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') })}>
            Set up
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="ww-tabs" role="tablist">
        <button
          className={tab === 'overview' ? 'active' : ''}
          onClick={() => setTab('overview')}
          role="tab"
          aria-selected={tab === 'overview'}
        >
          Overview
        </button>
        <button
          className={tab === 'grid' ? 'active' : ''}
          onClick={() => setTab('grid')}
          role="tab"
          aria-selected={tab === 'grid'}
        >
          Grid
        </button>
        <button
          className={tab === 'history' ? 'active' : ''}
          onClick={() => setTab('history')}
          role="tab"
          aria-selected={tab === 'history'}
        >
          History
        </button>
        <button
          className={tab === 'settings' ? 'active' : ''}
          onClick={() => setTab('settings')}
          role="tab"
          aria-selected={tab === 'settings'}
        >
          Settings
        </button>
      </div>

      {/* Panels */}
      <div className="ww-content">
        {tab === 'overview' && <SummaryPanel />}
        {tab === 'grid' && <GridSchedulePanel />}
        {tab === 'history' && (
          <>
            <ChartPanel />
            <BreakdownPanel />
          </>
        )}
        {tab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  )
}
