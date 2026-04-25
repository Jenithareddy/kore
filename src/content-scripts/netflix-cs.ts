// src/content-scripts/netflix-cs.ts
// LAST_VERIFIED: 2024-01

import { detectDeviceType, detectConnectionType, parseQualityLabel, sendMessage } from './shared'
import type { QualityTier } from '../carbon-calculator'

console.log('[BandWatt] Netflix content script loaded')

const PLATFORM = 'netflix'
let currentQuality: QualityTier = '1080p'
let isPlaying = false
let qualityPollInterval: ReturnType<typeof setInterval> | null = null
let keepAlivePort: ReturnType<typeof chrome.runtime.connect> | null = null

function detectQualityFromDOM(): QualityTier | null {
  // Netflix hides quality — check data-uia attributes (more stable than class names)
  const qualityEl = document.querySelector('[data-uia="video-quality"]')
  if (qualityEl?.textContent) {
    const q = parseQualityLabel(qualityEl.textContent)
    if (q) return q
  }
  // Fallback: check audio/subtitle menu for quality info
  const menuItems = document.querySelectorAll('[data-uia*="quality"]')
  for (const item of menuItems) {
    if (item.textContent) {
      const q = parseQualityLabel(item.textContent)
      if (q) return q
    }
  }
  return null
}

function detectQuality(video: HTMLVideoElement): QualityTier {
  const domQuality = detectQualityFromDOM()
  if (domQuality) return domQuality
  // Secondary: getVideoPlaybackQuality (frame stats only)
  video.getVideoPlaybackQuality() // call as secondary signal
  return '1080p' // default
}

function detectAutoplay(): boolean {
  // Netflix post-play countdown overlay
  if (document.querySelector('[data-uia="next-episode-seamless-button"]')) return true
  if (document.querySelector('.watch-video--next-episode-point')) return true
  if (document.querySelector('.postplay-container')) return true
  return false
}

function startQualityPolling(video: HTMLVideoElement): void {
  if (qualityPollInterval) return
  qualityPollInterval = setInterval(() => {
    const detected = detectQuality(video)
    if (detected !== currentQuality) {
      currentQuality = detected
      sendMessage({
        type: 'QUALITY_CHANGE',
        payload: { platform: PLATFORM, newQuality: currentQuality, changeTimestamp: Date.now() },
      })
    }
  }, 2000)
}

function stopQualityPolling(): void {
  if (qualityPollInterval) { clearInterval(qualityPollInterval); qualityPollInterval = null }
}

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
      autoplay: detectAutoplay(),
      startTimestamp: Date.now(),
      videoDurationSeconds: (video.duration && isFinite(video.duration)) ? video.duration : undefined,
    },
  })
  console.log(`[BandWatt] Netflix play detected (quality: ${currentQuality})`)
}

function onStop(): void {
  if (!isPlaying) return
  isPlaying = false
  stopQualityPolling()
  closeKeepAlivePort()
  sendMessage({
    type: 'ACTIVITY_STOP',
    payload: { platform: PLATFORM, stopTimestamp: Date.now() },
  })
  console.log('[BandWatt] Netflix stop detected')
}

function attachToVideo(video: HTMLVideoElement): void {
  video.addEventListener('play', () => onPlay(video))
  video.addEventListener('pause', () => onStop())
  video.addEventListener('ended', () => onStop())
}

function findAndAttach(): void {
  const video = document.querySelector<HTMLVideoElement>('video')
  if (video) { attachToVideo(video); return }
  const observer = new MutationObserver(() => {
    const v = document.querySelector<HTMLVideoElement>('video')
    if (v) { observer.disconnect(); attachToVideo(v) }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

try {
  findAndAttach()
} catch (err) {
  console.warn('[BandWatt] Netflix content script init error:', err)
}
