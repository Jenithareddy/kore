---
inclusion: always
---

# Supported Platforms

DOM selectors and quality-detection rules for each supported streaming and AI site. These are brittle by nature — platform DOM changes will break detection. Isolated here so updates are easy to find and apply.

## Video Streaming Platforms

### YouTube (`*://*.youtube.com/*`)

**Playback detection:**
- Video element: `video.html5-main-video`
- Play event: `video.addEventListener('play', ...)`
- Pause/end events: `video.addEventListener('pause', ...)`, `video.addEventListener('ended', ...)`

**Quality detection (priority order):**
1. DOM label: `.ytp-settings-button` → click → `.ytp-quality-menu .ytp-menuitem[aria-checked="true"] .ytp-menuitem-label`
   - Alternatively: `.ytp-quality-badge` text content (e.g. "1080p", "4K")
2. Fallback: `video.getVideoPlaybackQuality()` — returns frame stats, not resolution; use as secondary signal only
3. Default: assume `1080p`

**Quality polling interval:** every 2 seconds during active playback

**Autoplay detection:**
- Check `video.hasAttribute('data-autoplay')`
- Check for "Up Next" overlay: `.ytp-autonav-endscreen-upnext-header` visible in DOM
- Check autoplay toggle state: `.ytp-autonav-toggle-button[aria-checked="true"]`

**Quality label mapping:**
| DOM text | QualityTier |
|----------|-------------|
| "480p"   | `480p`      |
| "720p" / "720p60" | `720p` |
| "1080p" / "1080p60" / "1080p Premium" | `1080p` |
| "1440p" / "2160p" / "4K" | `4K` |

---

### Netflix (`*://*.netflix.com/*`)

**Playback detection:**
- Video element: `video` (single video element on playback page)
- Play/pause/end: standard video element events

**Quality detection (priority order):**
1. DOM label: `.watch-video--player-view` → look for quality indicator text
   - Netflix hides quality info; check `.video-quality` or `[data-uia="video-quality"]` if present
   - Some Netflix UIs expose quality in the audio/subtitle menu
2. Fallback: `video.getVideoPlaybackQuality()` — frame stats only
3. Default: assume `1080p`

**Autoplay detection:**
- Post-play countdown: `[data-uia="next-episode-seamless-button"]` or `.postplay-container` visible
- "Next Episode in X" overlay: `.watch-video--next-episode-point` visible

**Notes:**
- Netflix uses DRM (Widevine); direct quality API access is not available
- Quality detection is best-effort; default to 1080p when uncertain
- Netflix DOM selectors change frequently — check `data-uia` attributes as they are more stable

---

## AI Prompt Platforms

### ChatGPT (`*://chat.openai.com/*`)

**Prompt input selector:** `#prompt-textarea` or `textarea[data-id="root"]`

**Submission detection:**
- `form` submit event on `form[data-testid="send-message-form"]`
- `keydown` Enter on the textarea (when not in multiline mode)
- Send button click: `button[data-testid="send-button"]`

**Character count:** `promptElement.value.length` or `promptElement.textContent.length`

---

### Claude (`*://claude.ai/*`)

**Prompt input selector:** `div[contenteditable="true"].ProseMirror` or `[data-testid="chat-input"]`

**Submission detection:**
- `keydown` Enter (without Shift) on the contenteditable div
- Send button click: `button[aria-label="Send message"]`

**Character count:** `promptElement.textContent.length`

---

### Gemini (`*://gemini.google.com/*`)

**Prompt input selector:** `rich-textarea .ql-editor` or `[data-testid="text-input"]`

**Submission detection:**
- `keydown` Enter on the input
- Send button click: `button.send-button` or `mat-icon[data-mat-icon-name="send"]`

**Character count:** `promptElement.textContent.length`

---

## Maintenance Notes

- DOM selectors should be verified against live sites before each release
- Use `data-testid` and `data-uia` attributes where available — they are more stable than class names
- When a selector breaks, log a local detection failure and skip the event (do not crash or emit incomplete data)
- Platform-specific selector updates should only require changes to this file and the corresponding content script
- Consider adding a `LAST_VERIFIED` date comment next to each selector block
