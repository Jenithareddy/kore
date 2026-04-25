import * as fc from 'fast-check'
import '@testing-library/jest-dom'

fc.configureGlobal({ numRuns: 100 })

// Polyfill ResizeObserver for jsdom (required by Recharts ResponsiveContainer)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
