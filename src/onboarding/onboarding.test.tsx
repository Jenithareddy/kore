import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { db, getSetting } from '../db'
import { OnboardingApp } from './OnboardingApp'

vi.stubGlobal('chrome', {
  runtime: { sendMessage: vi.fn(), getURL: vi.fn((p: string) => p) },
  tabs: { create: vi.fn() },
})

beforeEach(async () => {
  await db.settings.clear()
})

describe('Onboarding flow', () => {
  it('renders screen 1 (permissions) first', () => {
    render(<OnboardingApp />)
    expect(screen.getByTestId('screen-permissions')).toBeInTheDocument()
    expect(screen.queryByTestId('screen-region')).not.toBeInTheDocument()
  })

  it('navigates to screen 2 (region) on Next click', () => {
    render(<OnboardingApp />)
    fireEvent.click(screen.getByTestId('next-to-region'))
    expect(screen.getByTestId('screen-region')).toBeInTheDocument()
  })

  it('navigates to screen 3 (privacy) on Next click', () => {
    render(<OnboardingApp />)
    fireEvent.click(screen.getByTestId('next-to-region'))
    fireEvent.click(screen.getByTestId('next-to-privacy'))
    expect(screen.getByTestId('screen-privacy')).toBeInTheDocument()
  })

  it('navigates back from screen 2 to screen 1', () => {
    render(<OnboardingApp />)
    fireEvent.click(screen.getByTestId('next-to-region'))
    fireEvent.click(screen.getByTestId('back-to-permissions'))
    expect(screen.getByTestId('screen-permissions')).toBeInTheDocument()
  })

  it('persists region code on completion', async () => {
    // Mock window.close
    const closeSpy = vi.fn()
    vi.stubGlobal('close', closeSpy)

    render(<OnboardingApp />)
    fireEvent.click(screen.getByTestId('next-to-region'))

    // Open the dropdown and select a region
    fireEvent.focus(screen.getByTestId('region-input'))
    await waitFor(() => {
      expect(screen.getByTestId('region-option-US-CAL-CISO')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('region-option-US-CAL-CISO'))

    fireEvent.click(screen.getByTestId('next-to-privacy'))
    fireEvent.click(screen.getByTestId('get-started'))

    await waitFor(async () => {
      const region = await getSetting<string>('region')
      expect(region).toBe('US-CAL-CISO')
    })

    await waitFor(async () => {
      const complete = await getSetting<boolean>('onboardingComplete')
      expect(complete).toBe(true)
    })
  })

  it('sets onboardingComplete even without region', async () => {
    const closeSpy = vi.fn()
    vi.stubGlobal('close', closeSpy)

    render(<OnboardingApp />)
    fireEvent.click(screen.getByTestId('next-to-region'))
    // Skip region input
    fireEvent.click(screen.getByTestId('next-to-privacy'))
    fireEvent.click(screen.getByTestId('get-started'))

    await waitFor(async () => {
      const complete = await getSetting<boolean>('onboardingComplete')
      expect(complete).toBe(true)
    })
  })

  it('incomplete onboarding leaves onboardingComplete unset', async () => {
    render(<OnboardingApp />)
    // User just views screen 1 but doesn't complete
    const complete = await getSetting<boolean>('onboardingComplete')
    expect(complete).toBeUndefined()
  })
})
