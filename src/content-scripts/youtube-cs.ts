// src/content-scripts/youtube-cs.ts
// LAST_VERIFIED: 2024-01

import { detectDeviceType, detectConnectionType, parseQualityLabel, sendMessage } from './shared'
import type { QualityTier } from '../carbon-calculator'

console.log('[BandWatt] YouTube content script loaded')

const PLATFORM = 'youtube'
let currentQuality: QualityTier = '1080p'
let isPlaying = false
let qualityPollInterval: ReturnType<typeof setInterval> | null = null
let keepAlivePort: ReturnType<typeof chrome.runtime.connect> | null = null

// ─── Quality detection ────────────────────────────────────────────────────────

function detectQualityFromDOM(): QualityTier | null {
  // Priority 1a: quality badge text (e.g. "1080p", "4K")
  const badge = document.querySelector('.ytp-quality-badge')
  if (badge?.textContent) {
    const q = parseQualityLabel(badge.textContent)
    if (q) return q
  }
  // Priority 1b: checked menu item in quality settings
  const checkedItem = document.querySelector(
    '.ytp-quality-menu .ytp-menuitem[aria-checked="true"] .ytp-menuitem-label'
  )
  if (checkedItem?.textContent) {
    const q = parseQualityLabel(checkedItem.textContent)
    if (q) return q
  }
  return null
}

function detectQuality(video: HTMLVideoElement): QualityTier {
  // Priority 1: DOM label (quality badge or settings menu)
  const domQuality = detectQualityFromDOM()
  if (domQuality) return domQuality
  // Priority 2: getVideoPlaybackQuality (frame stats — secondary signal only)
  const playbackQuality = video.getVideoPlaybackQuality()
  if (playbackQuality && playbackQuality.totalVideoFrames > 0) {
    // Can't determine resolution from frame stats alone — use as signal that video is active
    // Fall through to default
  }
  // Priority 3: default
  return '1080p'
}

function startQualityPolling(video: HTMLVideoElement): void {
  if (qualityPollInterval) return
  qualityPollInterval = setInterval(() => {
    const detected = detectQuality(video)
    if (detected !== currentQuality) {
      const prev = currentQuality
      currentQuality = detected
      console.log(`[BandWatt] YouTube quality changed: ${prev} → ${currentQuality}`)
      sendMessage({
        type: 'QUALITY_CHANGE',
        payload: { platform: PLATFORM, newQuality: currentQuality, changeTimestamp: Date.now() },
      })
    }
  }, 2000)
}

function stopQualityPolling(): void {
  if (qualityPollInterval) {
    clearInterval(qualityPollInterval)
    qualityPollInterval = null
  }
}

// ─── Autoplay detection ───────────────────────────────────────────────────────

function detectAutoplay(video: HTMLVideoElement): boolean {
  if (video.hasAttribute('data-autoplay')) return true
  const upNextOverlay = document.querySelector('.ytp-autonav-endscreen-upnext-header')
  if (upNextOverlay) return true
  const autonavToggle = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]')
  if (autonavToggle && !document.hasFocus()) return true
  return false
}

// ─── Port-based keep-alive ────────────────────────────────────────────────────

function openKeepAlivePort(): void {
  if (keepAlivePort) return
  try {
    keepAlivePort = chrome.runtime.connect({ name: 'wattwise-keepalive' })
    keepAlivePort.onDisconnect.addListener(() => { keepAlivePort = null })
  } catch { /* extension context may be invalidated */ }
}

function closeKeepAlivePort(): void {
  keepAlivePort?.disconnect()
  keepAlivePort = null
}

// ─── Video event handlers ─────────────────────────────────────────────────────

function onPlay(video: HTMLVideoElement): void {
  if (isPlaying) return
  isPlaying = true
  currentQuality = detectQuality(video)
  openKeepAlivePort()
  startQualityPolling(video)
  sendMessage({
    type: 'ACTIVITY_START',
    payload: {
      type: 'video_streaming',
      platform: PLATFORM,
      quality: currentQuality,
      deviceType: detectDeviceType(),
      connectionType: detectConnectionType(),
      autoplay: detectAutoplay(video),
      startTimestamp: Date.now(),
      videoDurationSeconds: (video.duration && isFinite(video.duration)) ? video.duration : undefined,
    },
  })
  console.log(`[BandWatt] YouTube play detected (quality: ${currentQuality})`)

  // Scheduler nudge: if video duration > 20 minutes, request grid forecast for nudge evaluation
  const durationMinutes = (video.duration && isFinite(video.duration))
    ? video.duration / 60
    : 0
  if (durationMinutes > 20) {
    sendMessage({ type: 'GET_GRID_FORECAST' })
    console.log(`[BandWatt] Video duration ${Math.round(durationMinutes)} min — requesting nudge evaluation`)
  }
}

function onStop(_video: HTMLVideoElement): void {
  if (!isPlaying) return
  isPlaying = false
  stopQualityPolling()
  closeKeepAlivePort()
  sendMessage({
    type: 'ACTIVITY_STOP',
    payload: { platform: PLATFORM, stopTimestamp: Date.now() },
  })
  console.log('[BandWatt] YouTube stop detected')
}

// ─── Video element observer ───────────────────────────────────────────────────

function attachToVideo(video: HTMLVideoElement): void {
  video.addEventListener('play', () => onPlay(video))
  video.addEventListener('pause', () => onStop(video))
  video.addEventListener('ended', () => onStop(video))
}

function findAndAttach(): void {
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video')
  if (video) {
    attachToVideo(video)
    return
  }
  // Wait for video element to appear
  const observer = new MutationObserver(() => {
    const v = document.querySelector<HTMLVideoElement>('video.html5-main-video')
    if (v) {
      observer.disconnect()
      attachToVideo(v)
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

try {
  findAndAttach()
} catch (err) {
  console.warn('[BandWatt] YouTube content script init error:', err)
}
