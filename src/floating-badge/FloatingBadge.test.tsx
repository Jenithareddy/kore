// src/floating-badge/FloatingBadge.test.tsx
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as fc from 'fast-check'
import { FloatingBadge, formatCarbon, type BadgeProps } from './FloatingBadge'

describe('formatCarbon', () => {
  it('displays grams below 100', () => {
    expect(formatCarbon(42)).toBe('42.0 g')
    expect(formatCarbon(0)).toBe('0.0 g')
    expect(formatCarbon(99.9)).toBe('99.9 g')
  })

  it('displays kg at and above 100', () => {
    expect(formatCarbon(100)).toBe('0.10 kg')
    expect(formatCarbon(1000)).toBe('1.00 kg')
    expect(formatCarbon(150.5)).toBe('0.15 kg')
  })
})

describe('Property 15: Badge unit switches at 100 gCO₂e threshold', () => {
  /**
   * **Validates: Requirements 5.3**
   */
  it('values < 100 render in grams, values >= 100 render in kg', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100000, noNaN: true }),
        (value) => {
          const result = formatCarbon(value)
          if (value < 100) {
            expect(result).toContain('g')
            expect(result).not.toContain('kg')
          } else {
            expect(result).toContain('kg')
          }
        },
      ),
    )
  })
})

describe('FloatingBadge component', () => {
  const defaultProps: BadgeProps = {
    sessionCarbonG: 42,
    autoplayCarbonG: 0,
  }

  it('renders the carbon value', () => {
    render(<FloatingBadge {...defaultProps} />)
    expect(screen.getByTestId('carbon-value')).toHaveTextContent('42.0 g')
  })

  it('switches to kg at 100g', () => {
    render(<FloatingBadge sessionCarbonG={150} autoplayCarbonG={0} />)
    expect(screen.getByTestId('carbon-value')).toHaveTextContent('0.15 kg')
  })

  it('hides after dismiss button click', () => {
    render(<FloatingBadge {...defaultProps} />)
    expect(screen.getByTestId('wattwise-badge')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('dismiss-button'))
    expect(screen.queryByTestId('wattwise-badge')).not.toBeInTheDocument()
  })

  it('shows video preview with quality and time suggestions when provided', () => {
    render(
      <FloatingBadge
        sessionCarbonG={42}
        autoplayCarbonG={0}
        videoPreview={{
          durationMinutes: 12,
          quality: '1080p',
          predictedCarbonG: 24.8,
          lowerQuality: '720p',
          lowerCarbonG: 11.9,
          qualitySavingsPct: 52,
          bestHour: 14,
          bestHourCarbonG: 16.1,
          timeSavingsPct: 35,
          googleSearches: 124,
        }}
      />,
    )
    const badge = screen.getByTestId('wattwise-badge')
    expect(badge).toHaveTextContent('12-min video')
    expect(badge).toHaveTextContent('24.8 g')
    expect(badge).toHaveTextContent('124 Google searches')
    expect(badge).toHaveTextContent('720p')
    expect(badge).toHaveTextContent('52%')
    expect(badge).toHaveTextContent('14:00')
    expect(badge).toHaveTextContent('35%')
  })

  it('does not show quality suggestion when quality is already lowest', () => {
    render(
      <FloatingBadge
        sessionCarbonG={42}
        autoplayCarbonG={0}
        videoPreview={{
          durationMinutes: 12,
          quality: '480p',
          predictedCarbonG: 5.0,
          lowerQuality: '480p',
          lowerCarbonG: 5.0,
          qualitySavingsPct: 0,
          bestHour: 14,
          bestHourCarbonG: 3.2,
          timeSavingsPct: 36,
          googleSearches: 25,
        }}
      />,
    )
    const badge = screen.getByTestId('wattwise-badge')
    expect(badge).not.toHaveTextContent('💡')
  })

  it('shows compact display when no video preview', () => {
    render(<FloatingBadge {...defaultProps} />)
    expect(screen.getByTestId('carbon-value')).toBeInTheDocument()
    expect(screen.getByTestId('wattwise-badge')).not.toHaveTextContent('Google searches')
  })

  it('shows autoplay indicator when autoplayCarbonG > 10', () => {
    render(<FloatingBadge sessionCarbonG={50} autoplayCarbonG={15} />)
    expect(screen.getByTestId('autoplay-indicator')).toHaveTextContent('from autoplay')
  })

  it('does not show autoplay indicator when autoplayCarbonG <= 10', () => {
    render(<FloatingBadge sessionCarbonG={50} autoplayCarbonG={5} />)
    expect(screen.queryByTestId('autoplay-indicator')).not.toBeInTheDocument()
  })
})
