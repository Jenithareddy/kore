import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  isAllowlistedDomain,
  inspectPayload,
  validateAllowlistedPayload,
  ALLOWLISTED_DOMAINS,
} from './payload-inspector'

// Property 8: Ethics Gate blocks all non-allowlisted destinations
// **Validates: Requirements 9.2**
describe('Property 8: Ethics Gate blocks all non-allowlisted destinations', () => {
  it('allowlisted domains pass', () => {
    expect(isAllowlistedDomain('https://api.electricitymap.org/v3/carbon-intensity/latest')).toBe(true)
    expect(isAllowlistedDomain('https://api.eia.gov/v2/electricity/rto')).toBe(true)
  })

  it('non-allowlisted domains are blocked', () => {
    expect(isAllowlistedDomain('https://evil.com/steal')).toBe(false)
    expect(isAllowlistedDomain('https://google.com')).toBe(false)
    expect(isAllowlistedDomain('https://api.electricitymap.org.evil.com')).toBe(false)
  })

  it('property: any URL not matching allowlisted domains is blocked', () => {
    fc.assert(
      fc.property(
        fc.webUrl().filter(url => {
          try {
            const h = new URL(url).hostname
            return !ALLOWLISTED_DOMAINS.some(d => h === d || h.endsWith('.' + d))
          } catch { return true }
        }),
        (url) => {
          expect(isAllowlistedDomain(url)).toBe(false)
        },
      ),
    )
  })
})

// Property 9: Allowlisted request payloads contain only permitted fields
// **Validates: Requirements 9.3, 9.7, 2.6**
describe('Property 9: Allowlisted request payloads contain only permitted fields', () => {
  it('valid payload passes', () => {
    expect(validateAllowlistedPayload({ zone: 'US-CAL-CISO', timestamp: 3600000 })).toBe(true)
    expect(validateAllowlistedPayload({ zone: 'US-TEX-ERCO' })).toBe(true)
    expect(validateAllowlistedPayload(null)).toBe(true)
    expect(validateAllowlistedPayload(undefined)).toBe(true)
  })

  it('payload with extra fields fails', () => {
    expect(validateAllowlistedPayload({ zone: 'US-CAL-CISO', url: 'https://youtube.com' })).toBe(false)
    expect(validateAllowlistedPayload({ zone: 'US-CAL-CISO', pageTitle: 'My Video' })).toBe(false)
    expect(validateAllowlistedPayload({ zone: 'US-CAL-CISO', tabId: 123 })).toBe(false)
  })

  it('payload with unrounded timestamp fails', () => {
    expect(validateAllowlistedPayload({ zone: 'US-CAL-CISO', timestamp: Date.now() })).toBe(false)
  })

  it('property: payloads with PII patterns in string form are rejected', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('user@example.com'),
          fc.constant('192.168.1.1'),
          fc.constant('https://youtube.com/watch?v=abc'),
          fc.constant('+1-555-123-4567'),
          fc.constant('37.7749295'),
        ),
        (piiString) => {
          expect(validateAllowlistedPayload(piiString)).toBe(false)
        },
      ),
    )
  })
})

// PII pattern detection unit tests
describe('PII pattern detection', () => {
  it('detects email addresses', () => {
    expect(inspectPayload('contact user@example.com now').length).toBeGreaterThan(0)
  })
  it('detects phone numbers', () => {
    expect(inspectPayload('call +1-555-123-4567').length).toBeGreaterThan(0)
  })
  it('detects IPv4 addresses', () => {
    expect(inspectPayload('ip is 192.168.1.1').length).toBeGreaterThan(0)
  })
  it('detects URLs', () => {
    expect(inspectPayload('visit https://youtube.com/watch').length).toBeGreaterThan(0)
  })
  it('detects GPS coordinates', () => {
    expect(inspectPayload('lat 37.7749295 lon -122.4194155').length).toBeGreaterThan(0)
  })
  it('clean region code passes', () => {
    expect(inspectPayload('US-CAL-CISO').length).toBe(0)
  })
})
