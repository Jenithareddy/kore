# Spec: AI Prompt Tracker

## Supported Platforms

| Platform | Domain               |
|----------|----------------------|
| ChatGPT  | `chat.openai.com`    |
| Claude   | `claude.ai`          |
| Gemini   | `gemini.google.com`  |

## Detection

Content scripts on each platform detect outgoing prompt submissions via:
- `submit` event on the prompt form
- `keydown` with `Enter` key (where applicable per platform)

## Token Estimation

Tokens are estimated **client-side** from the visible character count of the prompt input field at the time of submission:

```
tokens = characterCount / 4   // 4 chars per token heuristic
```

The **prompt text itself is never captured, stored, or transmitted**. Only `characterCount` (an integer) is recorded.

## Energy Calculation

```
energyWh = (tokens / 1000) × 0.3 Wh    // Ren et al. 2023
networkKWh = energyWh / 1000
gCO2e = (networkKWh + deviceKWh) × gridIntensity
```

See `carbon_calculator.spec.md` for full formula.

## Activity Event Emitted

```typescript
{
  type: "ai_prompt"
  platform: "chatgpt" | "claude" | "gemini"
  timestamp: number       // Unix ms
  characterCount: number  // length of prompt input text — NOT the text itself
  deviceType: DeviceType
  connectionType: ConnectionType
}
```

## Error Handling

- If the prompt input field is not detectable (DOM changes, platform updates): log a local detection failure and **skip** the event — do not emit incomplete data
- Detection failures are logged locally only, never sent externally

## Privacy Guarantee

- `characterCount` is the only prompt-derived value stored
- The prompt text, partial text, or any substring is **never** captured
- Validated by Property 16 in `design.md`

## Correctness Properties

- Emitted `ActivityStartPayload` contains `characterCount >= 0`
- Emitted payload does NOT contain the prompt text or any substring of it
- Detection failure results in a skipped event, not an error or incomplete record
