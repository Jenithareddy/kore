// src/popup/popup.test.tsx
// Unit tests for popup dashboard panels and logic

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { db, setAggregate, setSetting, type AggregateRecord, type AggregateKey } from '../db'
import { selectBestAnchors } from './panels/AnchorsPanel'
import { computeBreakdownPercentages } from './panels/BreakdownPanel'

// ─── Chrome API mock ──────────────────────────────────────────────────────────

const chromeMock = {
  runtime: {
    sendMessage: vi.fn((_msg: unknown, cb?: (resp: unknown) => void) => {
      if (cb) cb({ ok: true })
    }),
    getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
  },
  tabs: {
    create: vi.fn(),
  },
}

vi.stubGlobal('chrome', chromeMock)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAggregate(key: AggregateKey, overrides: Partial<AggregateRecord> = {}): AggregateRecord {
  return {
    key,
    totalGCO2e: 0,
    videoUserGCO2e: 0,
    videoAutoplayGCO2e: 0,
    aiPromptGCO2e: 0,
    videoCallGCO2e: 0,
    pageLoadGCO2e: 0,
    lastUpdated: Date.now(),
    ...overrides,
  }
}

async function seedAggregates(overrides: Partial<AggregateRecord> = {}) {
  const keys: AggregateKey[] = ['1h', '24h', '7d', '30d']
  for (const key of keys) {
    await setAggregate(makeAggregate(key, overrides))
  }
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.activities.clear()
  await db.aggregates.clear()
  await db.violations.clear()
  await db.settings.clear()
  vi.clearAllMocks()
})

afterEach(async () => {
  await db.activities.clear()
  await db.aggregates.clear()
  await db.violations.clear()
  await db.settings.clear()
})

// ─── Pure logic tests ─────────────────────────────────────────────────────────

describe('selectBestAnchors (log10 scoring)', () => {
  it('returns 2 anchors for a typical 30-day total', () => {
    const anchors = selectBestAnchors(5000)
    expect(anchors).toHaveLength(2)
    for (const a of anchors) {
      expect(a.value).toBeGreaterThan(0)
      expect(a.label).toBeTruthy()
    }
  })

  it('returns empty array for zero gCO2e', () => {
    expect(selectBestAnchors(0)).toHaveLength(0)
  })

  it('returns empty array for negative gCO2e', () => {
    expect(selectBestAnchors(-10)).toHaveLength(0)
  })

  it('selects miles for 5000 gCO2e (closest to 1.0 on log scale)', () => {
    const anchors = selectBestAnchors(5000)
    const keys = anchors.map(a => a.key)
    expect(keys).toContain('miles')
  })
})

describe('computeBreakdownPercentages', () => {
  it('computes correct percentages', () => {
    const items = [
      { label: 'A', value: 50, testId: 'a' },
      { label: 'B', value: 30, testId: 'b' },
      { label: 'C', value: 20, testId: 'c' },
    ]
    const result = computeBreakdownPercentages(items)
    expect(result[0].pct).toBeCloseTo(50)
    expect(result[1].pct).toBeCloseTo(30)
    expect(result[2].pct).toBeCloseTo(20)
  })

  it('percentages sum to ~100%', () => {
    const items = [
      { label: 'Video', value: 100, testId: 'v' },
      { label: 'Autoplay', value: 25, testId: 'a' },
      { label: 'AI', value: 50, testId: 'ai' },
      { label: 'Calls', value: 15, testId: 'c' },
      { label: 'Pages', value: 10, testId: 'p' },
    ]
    const result = computeBreakdownPercentages(items)
    const sum = result.reduce((s, r) => s + r.pct, 0)
    expect(sum).toBeCloseTo(100, 1)
  })

  it('handles all-zero values', () => {
    const items = [
      { label: 'A', value: 0, testId: 'a' },
      { label: 'B', value: 0, testId: 'b' },
    ]
    const result = computeBreakdownPercentages(items)
    expect(result[0].pct).toBe(0)
    expect(result[1].pct).toBe(0)
  })
})

// ─── Component tests ──────────────────────────────────────────────────────────

describe('SummaryPanel', () => {
  it('renders correct totals from IndexedDB data', async () => {
    await seedAggregates({ totalGCO2e: 42 })

    const { SummaryPanel } = await import('./panels/SummaryPanel')
    render(<SummaryPanel />)

    await waitFor(() => {
      expect(screen.getByTestId('session-total')).toHaveTextContent('42.0 g')
      expect(screen.getByTestId('today-total')).toHaveTextContent('42.0 g')
      expect(screen.getByTestId('7day-total')).toHaveTextContent('42.0 g')
      expect(screen.getByTestId('30day-total')).toHaveTextContent('42.0 g')
    })
  })

  it('renders zero when no aggregates exist', async () => {
    const { SummaryPanel } = await import('./panels/SummaryPanel')
    render(<SummaryPanel />)

    await waitFor(() => {
      expect(screen.getByTestId('session-total')).toHaveTextContent('0.0 g')
    })
  })
})

describe('BreakdownPanel', () => {
  it('shows autoplay as a distinct line item', async () => {
    await setAggregate(makeAggregate('30d', {
      totalGCO2e: 100,
      videoUserGCO2e: 50,
      videoAutoplayGCO2e: 20,
      aiPromptGCO2e: 15,
      videoCallGCO2e: 10,
      pageLoadGCO2e: 5,
    }))

    const { BreakdownPanel } = await import('./panels/BreakdownPanel')
    render(<BreakdownPanel />)

    await waitFor(() => {
      expect(screen.getByTestId('breakdown-video-autoplay')).toBeInTheDocument()
      expect(screen.getByTestId('breakdown-video-autoplay')).toHaveTextContent('20.0 g')
      expect(screen.getByTestId('breakdown-video-autoplay')).toHaveTextContent('20.0%')
    })
  })
})

describe('SettingsPanel', () => {
  it('persists region code on selection from dropdown', async () => {
    const { SettingsPanel } = await import('./panels/SettingsPanel')
    render(<SettingsPanel />)

    await waitFor(() => {
      expect(screen.getByTestId('region-input')).toBeInTheDocument()
    })

    // Focus the input to open the dropdown
    const input = screen.getByTestId('region-input') as HTMLInputElement
    fireEvent.focus(input)

    // Click a region option from the dropdown
    await waitFor(() => {
      expect(screen.getByTestId('region-option-US-CAL-CISO')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('region-option-US-CAL-CISO'))

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
      { type: 'SET_REGION', payload: { regionCode: 'US-CAL-CISO' } },
    )
  })

  it('shows violation banner when unacknowledged violations exist', async () => {
    await db.violations.add({
      timestamp: Date.now(),
      blockedDestination: 'evil.com',
      ruleViolated: 'Non-allowlisted destination',
      acknowledged: false,
    })

    const { SettingsPanel } = await import('./panels/SettingsPanel')
    render(<SettingsPanel />)

    await waitFor(() => {
      expect(screen.getByTestId('violation-banner')).toBeInTheDocument()
      expect(screen.getByTestId('violation-banner')).toHaveTextContent('1 unacknowledged')
    })
  })

  it('violation banner is non-dismissable (no dismiss button on banner)', async () => {
    await db.violations.add({
      timestamp: Date.now(),
      blockedDestination: 'evil.com',
      ruleViolated: 'Non-allowlisted destination',
      acknowledged: false,
    })

    const { SettingsPanel } = await import('./panels/SettingsPanel')
    render(<SettingsPanel />)

    await waitFor(() => {
      const banner = screen.getByTestId('violation-banner')
      expect(banner).toBeInTheDocument()
      // Banner should not have a dismiss/close button
      const buttons = banner.querySelectorAll('button')
      expect(buttons.length).toBe(0)
    })
  })

  it('category toggles persist changes', async () => {
    const { SettingsPanel } = await import('./panels/SettingsPanel')
    render(<SettingsPanel />)

    await waitFor(() => {
      expect(screen.getByTestId('toggle-video')).toBeInTheDocument()
    })

    const videoToggle = screen.getByTestId('toggle-video') as HTMLInputElement
    expect(videoToggle.checked).toBe(true)

    fireEvent.click(videoToggle)

    await waitFor(() => {
      expect(videoToggle.checked).toBe(false)
    })
  })
})

describe('Setup prompt (onboarding incomplete)', () => {
  it('shows setup prompt when onboardingComplete is false', async () => {
    // onboardingComplete not set → getSetting returns undefined → defaults to false
    const { App } = await import('./App')

    await act(async () => {
      render(<App />)
    })

    await waitFor(() => {
      expect(screen.getByTestId('setup-prompt')).toBeInTheDocument()
      expect(screen.getByTestId('setup-prompt')).toHaveTextContent('Complete setup')
    })
  })

  it('hides setup prompt when onboardingComplete is true', async () => {
    await setSetting('onboardingComplete', true)

    const { App } = await import('./App')

    await act(async () => {
      render(<App />)
    })

    await waitFor(() => {
      expect(screen.queryByTestId('setup-prompt')).not.toBeInTheDocument()
    })
  })
})
