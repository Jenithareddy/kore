// src/content-scripts/badge-cs.ts
// Injects the FloatingBadge React component into the page via Shadow DOM.
// Shadow DOM prevents style leakage between the badge and the host page.

import React from 'react'
import ReactDOM from 'react-dom/client'
import { FloatingBadge, type BadgeProps } from '../floating-badge/FloatingBadge'
import type { BadgeUpdateMessage, ExtensionMessage } from '../messages'

console.log('[BandWatt] Badge content script loaded')

let root: ReactDOM.Root | null = null
let currentProps: BadgeProps = {
  sessionCarbonG: 0,
  autoplayCarbonG: 0,
}

function injectBadge(): void {
  try {
    // Create host element
    const host = document.createElement('div')
    host.id = 'wattwise-badge-host'
    host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;'
    document.body.appendChild(host)

    // Attach shadow DOM
    const shadow = host.attachShadow({ mode: 'closed' })

    // Mount React inside shadow
    const mountPoint = document.createElement('div')
    shadow.appendChild(mountPoint)
    root = ReactDOM.createRoot(mountPoint)
    root.render(React.createElement(FloatingBadge, currentProps))
  } catch (err) {
    // CSP may block shadow DOM injection — fail gracefully, tracking continues
    console.warn('[BandWatt] Badge injection failed (CSP?):', err)
  }
}

function updateBadge(props: BadgeProps): void {
  currentProps = props
  if (root) {
    root.render(React.createElement(FloatingBadge, currentProps))
  }
}

// ─── Nudge banner ──────────────────────────────────────────────────────────

let nudgeBannerEl: HTMLElement | null = null

function showNudgeBanner(message: string): void {
  // Remove any existing nudge banner
  dismissNudgeBanner()

  const banner = document.createElement('div')
  banner.id = 'wattwise-nudge-banner'
  banner.style.cssText = [
    'position: fixed',
    'bottom: 80px',
    'right: 16px',
    'z-index: 2147483646',
    'background: #1a1a2e',
    'color: #e0e0e0',
    'padding: 12px 16px',
    'border-radius: 8px',
    'font-family: system-ui, sans-serif',
    'font-size: 13px',
    'max-width: 340px',
    'box-shadow: 0 4px 12px rgba(0,0,0,0.3)',
    'display: flex',
    'flex-direction: column',
    'gap: 8px',
    'pointer-events: auto',
  ].join('; ')

  const msgEl = document.createElement('span')
  msgEl.textContent = message
  banner.appendChild(msgEl)

  const btnRow = document.createElement('div')
  btnRow.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;'

  const dismissBtn = document.createElement('button')
  dismissBtn.textContent = 'Dismiss'
  dismissBtn.style.cssText = 'background: #444; color: #fff; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;'
  dismissBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'DISMISS_NUDGE', payload: { activityType: 'video_streaming' } }).catch(() => {})
    dismissNudgeBanner()
  })

  btnRow.appendChild(dismissBtn)
  banner.appendChild(btnRow)

  document.body.appendChild(banner)
  nudgeBannerEl = banner
}

function dismissNudgeBanner(): void {
  if (nudgeBannerEl && nudgeBannerEl.parentNode) {
    nudgeBannerEl.parentNode.removeChild(nudgeBannerEl)
    nudgeBannerEl = null
  }
}

// Listen for BADGE_UPDATE, VIDEO_PREVIEW, NUDGE_SHOW, and ACTIVITY_STOP messages from the service worker
chrome.runtime.onMessage.addListener((message: BadgeUpdateMessage | ExtensionMessage) => {
  if (message.type === 'BADGE_UPDATE') {
    const badgeMsg = message as BadgeUpdateMessage
    updateBadge({
      sessionCarbonG: badgeMsg.sessionCarbonG,
      autoplayCarbonG: badgeMsg.autoplayCarbonG,
      comparisonQuality: badgeMsg.comparisonQuality,
      // Clear video preview when badge updates with new carbon data
    })
  } else if (message.type === 'VIDEO_PREVIEW') {
    const previewMsg = message as Extract<ExtensionMessage, { type: 'VIDEO_PREVIEW' }>
    currentProps = {
      ...currentProps,
      videoPreview: previewMsg.payload,
    }
    if (root) {
      root.render(React.createElement(FloatingBadge, currentProps))
    }
  } else if (message.type === 'ACTIVITY_STOP') {
    // Clear video preview when activity stops
    currentProps = {
      ...currentProps,
      videoPreview: undefined,
    }
    if (root) {
      root.render(React.createElement(FloatingBadge, currentProps))
    }
  } else if (message.type === 'NUDGE_SHOW') {
    const nudgeMsg = message as Extract<ExtensionMessage, { type: 'NUDGE_SHOW' }>
    showNudgeBanner(nudgeMsg.payload.message)
  }
})

// Inject when DOM is ready
if (document.body) {
  injectBadge()
} else {
  document.addEventListener('DOMContentLoaded', injectBadge)
}
