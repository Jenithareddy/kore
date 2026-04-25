// src/content-scripts/ai-cs.ts
// LAST_VERIFIED: 2024-01
// Tracks AI prompt submissions on ChatGPT, Claude, and Gemini.
// PRIVACY: Only characterCount (integer) is captured — never the prompt text itself.

import { detectDeviceType, detectConnectionType, sendMessage } from './shared'

console.log('[BandWatt] AI content script loaded')

type AIPlatform = 'chatgpt' | 'claude' | 'gemini'

function detectPlatform(): AIPlatform {
  const host = location.hostname
  if (host.includes('openai.com')) return 'chatgpt'
  if (host.includes('claude.ai')) return 'claude'
  return 'gemini'
}

const PLATFORM = detectPlatform()

/** Get the prompt input element for the current platform */
function getPromptInput(): HTMLElement | null {
  if (PLATFORM === 'chatgpt') {
    return (
      document.querySelector<HTMLElement>('#prompt-textarea') ??
      document.querySelector<HTMLElement>('textarea[data-id="root"]')
    )
  }
  if (PLATFORM === 'claude') {
    return (
      document.querySelector<HTMLElement>('div[contenteditable="true"].ProseMirror') ??
      document.querySelector<HTMLElement>('[data-testid="chat-input"]')
    )
  }
  // Gemini
  return (
    document.querySelector<HTMLElement>('rich-textarea .ql-editor') ??
    document.querySelector<HTMLElement>('[data-testid="text-input"]')
  )
}

/** Get character count from input element — NEVER captures text content */
function getCharacterCount(el: HTMLElement): number {
  if (el instanceof HTMLTextAreaElement) return el.value.length
  return el.textContent?.length ?? 0
}

function handleSubmit(): void {
  const input = getPromptInput()
  if (!input) {
    console.warn('[BandWatt] AI prompt input not detectable — skipping event')
    return
  }
  const characterCount = getCharacterCount(input)
  if (characterCount === 0) return

  sendMessage({
    type: 'ACTIVITY_START',
    payload: {
      type: 'ai_prompt',
      platform: PLATFORM,
      deviceType: detectDeviceType(),
      connectionType: detectConnectionType(),
      autoplay: false,
      startTimestamp: Date.now(),
      characterCount,
      // NOTE: prompt text is NOT captured — only characterCount (integer)
    },
  })
  // AI prompts are instantaneous — send stop immediately
  sendMessage({
    type: 'ACTIVITY_STOP',
    payload: { platform: PLATFORM, stopTimestamp: Date.now() + 100 },
  })
  console.log(`[BandWatt] ${PLATFORM} prompt detected (${characterCount} chars)`)
}

function attachListeners(): void {
  // Form submit
  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLElement
    if (form.tagName === 'FORM') handleSubmit()
  })

  // Enter key (without Shift for multiline)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const input = getPromptInput()
      if (input && (document.activeElement === input || input.contains(document.activeElement))) {
        handleSubmit()
      }
    }
  })

  // Send button click
  const sendButtonSelectors = [
    'button[data-testid="send-button"]',
    'button[aria-label="Send message"]',
    'button.send-button',
  ]
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    for (const selector of sendButtonSelectors) {
      if (target.matches(selector) || target.closest(selector)) {
        handleSubmit()
        break
      }
    }
  })
}

try {
  attachListeners()
} catch (err) {
  console.warn('[BandWatt] AI content script init error:', err)
}
