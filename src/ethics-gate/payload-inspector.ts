// src/ethics-gate/payload-inspector.ts
// Ethics Gate — payload inspection for outbound requests.
// Enforces that only permitted fields leave the device.

// Allowlisted API domains
export const ALLOWLISTED_DOMAINS = ['api.electricitymap.org', 'api.eia.gov']

// PII detection patterns
const PII_PATTERNS: Record<string, RegExp> = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  phone: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
  ipv4: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  ipv6: /([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}/,
  gps: /-?\d{1,3}\.\d{4,}/,
  url: /https?:\/\/[^\s"']+/,
  hostname: /\b[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.[a-zA-Z]{2,}\b/,
  tabId: /\btab[_-]?id\b/i,
  userId: /\buser[_-]?id\b/i,
  pageTitle: /\bpage[_-]?title\b/i,
  fineTimestamp: /\d{13}/,
}

export interface ViolationInfo {
  ruleViolated: string
  detail: string
}

/** Check if a destination URL is in the allowlist */
export function isAllowlistedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return ALLOWLISTED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))
  } catch {
    return false
  }
}

/** Inspect a payload string for PII patterns. Returns violations found. */
export function inspectPayload(payload: string): ViolationInfo[] {
  const violations: ViolationInfo[] = []
  for (const [name, pattern] of Object.entries(PII_PATTERNS)) {
    const match = payload.match(pattern)
    if (match) {
      violations.push({ ruleViolated: `pii_${name}`, detail: `Pattern "${name}" matched` })
    }
  }
  return violations
}

/**
 * Validate that a payload contains ONLY permitted fields for allowlisted requests.
 * Permitted: regionCode (string), timestamp rounded to nearest hour (number), apiToken (string).
 * Returns true if valid, false if any prohibited content is found.
 */
export function validateAllowlistedPayload(payload: unknown): boolean {
  if (payload === null || payload === undefined) return true
  if (typeof payload === 'string') {
    // Check for PII patterns in string payloads
    return inspectPayload(payload).length === 0
  }
  if (typeof payload !== 'object') return false
  const obj = payload as Record<string, unknown>
  const permittedKeys = new Set(['zone', 'regionCode', 'auth-token', 'api_key', 'timestamp'])
  for (const key of Object.keys(obj)) {
    if (!permittedKeys.has(key)) return false
  }
  // Check timestamp is rounded to nearest hour (divisible by 3600000)
  if ('timestamp' in obj && typeof obj.timestamp === 'number') {
    if (obj.timestamp % 3600000 !== 0) return false
  }
  return true
}
