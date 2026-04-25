// src/content-scripts/shared.ts
import type { DeviceType, ConnectionType, QualityTier } from '../carbon-calculator'
import type { ExtensionMessage } from '../messages'

/** Detect device type from user agent */
export function detectDeviceType(): DeviceType {
  const ua = navigator.userAgent.toLowerCase()
  if (/mobile|android|iphone|ipad/.test(ua)) return 'smartphone'
  if (/smart-tv|smarttv|googletv|appletv|hbbtv|pov_tv|netcast/.test(ua)) return 'tv'
  return 'laptop'
}

/** Detect connection type from Network Information API */
export function detectConnectionType(): ConnectionType {
  const nav = navigator as Navigator & { connection?: { effectiveType?: string } }
  const effectiveType = nav.connection?.effectiveType ?? ''
  return effectiveType.includes('4g') && !effectiveType.includes('wifi') ? 'cellular_4g' : 'fixed'
}

/** Map DOM quality label text to QualityTier */
export function parseQualityLabel(text: string): QualityTier | null {
  const t = text.trim().toLowerCase()
  if (t.includes('4k') || t.includes('2160') || t.includes('1440')) return '4K'
  if (t.includes('1080')) return '1080p'
  if (t.includes('720')) return '720p'
  if (t.includes('480')) return '480p'
  return null
}

/** Send a typed message to the service worker, retrying up to 3 times */
export async function sendMessage(message: ExtensionMessage, retries = 3): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      // Check if extension context is still valid
      if (!chrome.runtime?.id) {
        console.warn('[BandWatt] Extension context invalidated — cannot send message')
        return
      }
      const response = await chrome.runtime.sendMessage(message)
      console.log('[BandWatt] Message sent successfully:', message.type, response)
      return
    } catch (err) {
      if (i === retries - 1) {
        console.warn('[BandWatt] Failed to send message after retries:', message.type, err)
      } else {
        console.log(`[BandWatt] Retry ${i + 1}/${retries} for ${message.type}...`)
        await new Promise(r => setTimeout(r, 500))
      }
    }
  }
}
