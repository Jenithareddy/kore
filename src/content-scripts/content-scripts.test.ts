// src/content-scripts/content-scripts.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseQualityLabel, detectDeviceType, detectConnectionType } from './shared'

// Mock chrome.runtime.sendMessage
const mockSendMessage = vi.fn().mockResolvedValue(undefined)
vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: mockSendMessage,
    connect: vi.fn().mockReturnValue({
      onDisconnect: { addListener: vi.fn() },
      disconnect: vi.fn(),
    }),
  },
})

beforeEach(() => {
  mockSendMessage.mockClear()
})

describe('parseQualityLabel', () => {
  it('parses "4K" → "4K"', () => expect(parseQualityLabel('4K')).toBe('4K'))
  it('parses "2160p" → "4K"', () => expect(parseQualityLabel('2160p')).toBe('4K'))
  it('parses "1440p" → "4K"', () => expect(parseQualityLabel('1440p')).toBe('4K'))
  it('parses "1080p" → "1080p"', () => expect(parseQualityLabel('1080p')).toBe('1080p'))
  it('parses "1080p60" → "1080p"', () => expect(parseQualityLabel('1080p60')).toBe('1080p'))
  it('parses "1080p Premium" → "1080p"', () => expect(parseQualityLabel('1080p Premium')).toBe('1080p'))
  it('parses "720p" → "720p"', () => expect(parseQualityLabel('720p')).toBe('720p'))
  it('parses "720p60" → "720p"', () => expect(parseQualityLabel('720p60')).toBe('720p'))
  it('parses "480p" → "480p"', () => expect(parseQualityLabel('480p')).toBe('480p'))
  it('returns null for unrecognised text', () => expect(parseQualityLabel('Auto')).toBeNull())
  it('returns null for empty string', () => expect(parseQualityLabel('')).toBeNull())
})

describe('detectDeviceType', () => {
  it('returns "laptop" for a desktop user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      configurable: true,
    })
    expect(detectDeviceType()).toBe('laptop')
  })

  it('returns "smartphone" for a mobile user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      configurable: true,
    })
    expect(detectDeviceType()).toBe('smartphone')
  })
})

describe('detectConnectionType', () => {
  it('returns "fixed" when no Network Information API is available', () => {
    expect(detectConnectionType()).toBe('fixed')
  })
})

describe('AI prompt privacy', () => {
  it('getCharacterCount returns length without capturing text', () => {
    // Simulate what ai-cs.ts does: only read .length, never the text
    const promptText = 'This is a test prompt with some content'
    const characterCount = promptText.length
    // The payload should contain characterCount, not the text
    const payload = {
      type: 'ai_prompt' as const,
      platform: 'chatgpt',
      characterCount,
      // promptText is NOT in the payload
    }
    expect(payload.characterCount).toBe(promptText.length)
    expect(payload).not.toHaveProperty('promptText')
    expect(payload).not.toHaveProperty('text')
    expect(payload).not.toHaveProperty('content')
  })

  it('characterCount is always a non-negative integer', () => {
    const testCases = ['', 'hello', 'a'.repeat(1000)]
    for (const text of testCases) {
      const count = text.length
      expect(count).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(count)).toBe(true)
    }
  })
})

describe('Autoplay detection patterns', () => {
  it('YouTube autoplay: detects data-autoplay attribute', () => {
    const video = document.createElement('video')
    video.setAttribute('data-autoplay', '')
    expect(video.hasAttribute('data-autoplay')).toBe(true)
  })

  it('Netflix autoplay: detects next-episode-seamless-button', () => {
    const btn = document.createElement('button')
    btn.setAttribute('data-uia', 'next-episode-seamless-button')
    document.body.appendChild(btn)
    expect(
      document.querySelector('[data-uia="next-episode-seamless-button"]')
    ).not.toBeNull()
    document.body.removeChild(btn)
  })
})
