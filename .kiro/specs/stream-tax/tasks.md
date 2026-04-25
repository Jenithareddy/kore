# Implementation Plan: WattWise Chrome Extension

## Overview

Build the WattWise MV3 Chrome extension iteratively so that each major task group produces a
loadable, testable state. The order follows: scaffold → pure logic modules → storage → network →
service worker → content scripts → badge → ethics gate → popup → onboarding → scheduler nudge →
end-to-end integration. TypeScript is used throughout; Vite + CRXJS is the build tool;
fast-check provides property-based tests; Vitest runs all tests.

---

## Tasks

- [x] 1. Project Scaffold — bare-bones MV3 extension loadable in Chrome
  - [x] 1.1 Initialise the repository and install core dependencies
    - Run `npm create vite@latest wattwise -- --template react-ts` (or equivalent manual setup)
    - Install CRXJS Vite plugin (`@crxjs/vite-plugin`), Dexie.js, Recharts, fast-check, Vitest,
      React Testing Library, and `@types/chrome`
    - Pin all dependency versions in `package.json`
    - _Requirements: 13 (performance baseline requires a clean build)_
  - [x] 1.2 Create the Manifest V3 `manifest.json`
    - Declare `manifest_version: 3`, `name`, `version`, `description`
    - Add `background.service_worker` pointing to `src/background.ts`
    - Add `content_scripts` entries for YouTube, Netflix, and the three AI platforms
    - Add `action` popup pointing to `src/popup/index.html`
    - Declare permissions: `storage`, `alarms`, `tabs`, `webRequest`, `declarativeNetRequest`,
      `notifications`
    - Declare `host_permissions` for `*://*.youtube.com/*`, `*://*.netflix.com/*`,
      `*://chat.openai.com/*`, `*://claude.ai/*`, `*://gemini.google.com/*`
    - _Requirements: 3.7, 9.6_
  - [x] 1.3 Configure Vite + CRXJS build pipeline
    - Set up `vite.config.ts` with the CRXJS plugin pointing at `manifest.json`
    - Configure TypeScript strict mode in `tsconfig.json`
    - Add `npm run build` and `npm run dev` scripts
    - Verify the extension loads in Chrome (`chrome://extensions` → Load unpacked)
    - _Requirements: 13.1 (build must produce a loadable extension)_
  - [x] 1.4 Create the folder structure and stub entry-point files
    - `src/background.ts` — empty service worker stub
    - `src/content-scripts/youtube-cs.ts`, `netflix-cs.ts`, `ai-cs.ts` — empty stubs
    - `src/carbon-calculator.ts` — empty module stub
    - `src/grid-client.ts` — empty module stub
    - `src/db.ts` — empty Dexie stub
    - `src/popup/` — React app stub
    - `src/onboarding/` — React app stub
    - `src/floating-badge/` — React component stub
    - `src/ethics-gate/` — stub for DNR rules JSON and webRequest observer
    - _Requirements: all (structural prerequisite)_
  - [x] 1.5 Set up Vitest and fast-check test infrastructure
    - Configure `vitest.config.ts` with jsdom environment for UI tests
    - Add `fc.configureGlobal({ numRuns: 100 })` in a global test setup file
    - Add `npm run test` script (`vitest --run`)
    - Verify a trivial passing test runs successfully
    - _Requirements: design testing strategy_


- [x] 2. Carbon Calculator — pure functions and property-based tests
  - [x] 2.1 Implement energy model constants and type definitions
    - Define `ActivityType`, `QualityTier`, `DeviceType`, `ConnectionType` TypeScript types
    - Define `Activity`, `CarbonResult`, `QualityComparisonResult`, `ComparisonAnchors` interfaces
    - Export all energy model constants (data rates, kWh/GB values, device power draws, anchor
      conversion factors) as named constants in `carbon-calculator.ts`
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 12.1_
  - [x] 2.2 Implement `computeCarbon()` for video streaming activities
    - Compute `networkKWh = dataRateGB_per_hr[quality] × durationHours × energyPerGB[connection]`
    - Compute `deviceKWh = devicePowerW[device] × durationHours / 1000`
    - Return `gCO2e = (networkKWh + deviceKWh) × gridIntensityGCO2ePerKWh`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x]* 2.3 Write property test for non-negative carbon output (Property 1)
    - **Property 1: Carbon output is always non-negative**
    - Use fast-check arbitraries to generate all valid `Activity` shapes and non-negative grid
      intensity values; assert `computeCarbon().gCO2e >= 0` for every generated input
    - **Validates: Requirements 1.9**
  - [x]* 2.4 Write property test for video streaming energy formula (Property 2)
    - **Property 2: Video streaming energy formula correctness**
    - Generate random quality tiers, durations, and connection types; assert that
      `networkKWh` matches the formula exactly and that the cellular/fixed-line ratio equals
      `0.21 / 0.077` within floating-point tolerance
    - **Validates: Requirements 1.2, 1.3**
  - [x] 2.5 Implement `computeCarbon()` for AI prompt, video call, and page load activities
    - AI prompt: `tokens = characterCount / 4`; `energyWh = tokens / 1000 × 0.3`;
      add device energy; multiply by grid intensity
    - Video call: `energyKWh = durationMinutes × 0.002`; add device energy; multiply by grid
      intensity
    - Page load: return `1 gCO2e` baseline (no grid intensity scaling per design)
    - _Requirements: 1.5, 1.6, 1.7_
  - [x]* 2.6 Write property test for IEA 2022 tolerance (Property 3)
    - **Property 3: IEA 2022 tolerance — streaming estimates within 15%**
    - For each quality tier, compute `gCO2e` at 475 gCO₂e/kWh for a 1-hour session and assert
      the result is within ±15% of the IEA 2022 reference value for that tier
    - **Validates: Requirements 1.10**
  - [x] 2.7 Implement `compareQualities()` function
    - Call `computeCarbon()` for each tier; compute `percentageDifference` as
      `(tierA.gCO2e - tierB.gCO2e) / tierB.gCO2e × 100`
    - Return `QualityComparisonResult` with both tier results and the percentage difference
    - _Requirements: 1.8_
  - [x]* 2.8 Write property test for quality comparison anti-symmetry (Property 4)
    - **Property 4: Quality comparison anti-symmetry**
    - Generate pairs of distinct quality tiers; assert
      `compareQualities(A, B).percentageDifference === -compareQualities(B, A).percentageDifference`
      and that both individual `gCO2e` values are non-negative
    - **Validates: Requirements 1.8**
  - [x] 2.9 Implement `toComparisonAnchors()` function
    - Divide `gCO2e` by each anchor constant (0.2, 404, 8.22, 50) and return the four values
    - _Requirements: 12.1_
  - [x]* 2.10 Write property test for comparison anchors (Property 5)
    - **Property 5: Comparison anchors are non-negative and finite**
    - Generate non-negative `gCO2e` values; assert every anchor in the result is
      `>= 0` and `isFinite()`
    - **Validates: Requirements 12.3**
  - [x] 2.11 Checkpoint — run all Carbon Calculator tests
    - Ensure all property tests and unit tests pass (`npm run test`)
    - Ask the user if any questions arise before proceeding


- [x] 3. IndexedDB Store — Dexie schema, read/write, and purge
  - [x] 3.1 Define the Dexie schema and table types in `db.ts`
    - Extend `Dexie` as `WattWiseDB` with four tables: `activities`, `aggregates`,
      `violations`, `settings`
    - Define indexes: `activities` on `++id, timestamp, type, platform, autoplay`;
      `aggregates` on `key`; `violations` on `++id, timestamp`; `settings` on `key`
    - Export a singleton `db` instance
    - _Requirements: 8.4, 8.5_
  - [x] 3.2 Implement `ActivityRecord` write and read helpers
    - `writeActivity(record: ActivityRecord): Promise<number>` — adds a record and returns its id
    - `getActivitiesInWindow(startMs: number, endMs: number): Promise<ActivityRecord[]>` — queries
      by timestamp range
    - Ensure no prohibited fields (URL, page title, tab ID, prompt text, IP) are accepted in the
      `ActivityRecord` type
    - _Requirements: 8.1, 8.4, 8.5_
  - [x] 3.3 Implement aggregate read/write helpers
    - `getAggregate(key: AggregateKey): Promise<AggregateRecord | undefined>`
    - `setAggregate(record: AggregateRecord): Promise<void>` — uses Dexie `put()`
    - `recomputeAggregates(): Promise<void>` — recomputes all four windows from raw activity log
    - _Requirements: 8.3_
  - [x] 3.4 Implement the 30-day purge function
    - `purgeOldActivities(): Promise<number>` — deletes all `activities` records with
      `timestamp < Date.now() - 30 * 24 * 60 * 60 * 1000`; returns count of deleted records
    - _Requirements: 8.2_
  - [x] 3.5 Implement settings helpers
    - `getSetting<T>(key: string): Promise<T | undefined>`
    - `setSetting<T>(key: string, value: T): Promise<void>`
    - _Requirements: 7.8, 10.3_
  - [x] 3.6 Implement `clearAllData()` function
    - Delete all records from all tables and reset aggregates to zero
    - Must complete within 5 seconds
    - _Requirements: 8.6_
  - [ ]* 3.7 Write property test for aggregate consistency (Property 11)
    - **Property 11: Aggregate totals equal sum of individual records**
    - Generate arbitrary sequences of `ActivityRecord` objects with random timestamps within
      each window; write them to an in-memory Dexie instance; call `recomputeAggregates()`;
      assert each aggregate total equals the arithmetic sum of `gCO2e` values in that window
    - **Validates: Requirements 8.3**
  - [ ]* 3.8 Write property test for autoplay attribution (Property 12)
    - **Property 12: Autoplay activities are attributed to the autoplay bucket**
    - Generate mixed sequences of autoplay and user-initiated `ActivityRecord` objects; assert
      that `videoAutoplayGCO2e` equals the sum of `gCO2e` for `autoplay: true` records and
      `videoUserGCO2e` equals the sum for `autoplay: false` records
    - **Validates: Requirements 11.1**
  - [ ]* 3.9 Write property test for privacy field exclusion (Property 10)
    - **Property 10: Activity records never contain privacy-sensitive fields**
    - Generate arbitrary `ActivityRecord` objects via fast-check; assert that no record
      contains `url`, `pageTitle`, `tabId`, `promptText`, or `ipAddress` fields
    - **Validates: Requirements 8.5**
  - [x] 3.10 Checkpoint — run all IndexedDB Store tests
    - Ensure all property tests and unit tests pass (`npm run test`)
    - Ask the user if any questions arise before proceeding


- [x] 4. Grid Client — fetch, cache, and fallback chain
  - [x] 4.1 Implement type definitions and the static fallback table
    - Define `GridSource`, `GridConfidence`, `GridIntensityResult`, `HourlyForecast`,
      `GridCacheEntry` TypeScript types
    - Bundle the static hourly intensity table for the top 20 US grid zones as a JSON file
      imported at build time
    - _Requirements: 2.3, 2.5_
  - [x] 4.2 Implement the in-memory cache with 15-minute TTL
    - `Map<string, GridCacheEntry>` keyed by `regionCode`
    - `getCached(regionCode: string): GridIntensityResult | null` — returns null if expired
    - `setCached(regionCode: string, result: GridIntensityResult): void`
    - _Requirements: 2.4_
  - [x] 4.3 Implement the ElectricityMaps API fetch
    - `fetchElectricityMaps(regionCode: string): Promise<GridIntensityResult>` — calls
      `/v3/carbon-intensity/latest?zone={regionCode}` with only `zone` and `auth-token`
    - Round the timestamp to the nearest hour before including it in any stored result
    - Set `source: 'electricitymaps'`, `confidence: 'high'`
    - Throw on timeout (>5 s) or non-2xx response
    - _Requirements: 2.1, 2.6_
  - [x] 4.4 Implement the EIA fallback fetch
    - `fetchEIA(regionCode: string): Promise<GridIntensityResult>` — calls EIA Hourly Grid
      Monitor API for US regions only
    - Set `source: 'eia'`, `confidence: 'medium'`
    - Throw on failure
    - _Requirements: 2.2, 2.6_
  - [x] 4.5 Implement `getGridIntensity()` with the full fallback chain
    - Check cache first; if hit, return cached result
    - Try ElectricityMaps → EIA → static table → global average (475 gCO₂e/kWh)
    - Cache the result on success; set `confidence: 'low'` for static/global fallbacks
    - If no region configured, return global average and surface the setup prompt flag
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7_
  - [x] 4.6 Implement `getHourlyForecast()` for the next 24 hours
    - Return an array of `HourlyForecast` objects for hours 0–23 ahead
    - Use ElectricityMaps forecast endpoint if available; fall back to repeating the current
      intensity for all hours when only static/global data is available
    - _Requirements: 6.1_
  - [ ]* 4.7 Write property test for cache preventing redundant network calls (Property 6)
    - **Property 6: Grid client cache prevents redundant network calls**
    - Mock `fetch`; call `getGridIntensity()` twice within 15 minutes for the same region;
      assert `fetch` was called exactly once and both calls return the same `gCO2ePerKWh`
    - Generate random region codes and intensity values via fast-check
    - **Validates: Requirements 2.4**
  - [ ]* 4.8 Write property test for source and confidence fields (Property 7)
    - **Property 7: Grid intensity response always includes source and confidence**
    - Mock each fallback level in turn; assert that every returned `GridIntensityResult`
      has `source` in `{"electricitymaps","eia","static_fallback"}` and `confidence` in
      `{"high","medium","low"}`
    - **Validates: Requirements 2.5**
  - [x] 4.9 Checkpoint — run all Grid Client tests
    - Ensure all property tests and unit tests pass (`npm run test`)
    - Ask the user if any questions arise before proceeding


- [x] 5. Service Worker — message handling, activity lifecycle, and aggregate updates
  - [x] 5.1 Implement the typed message dispatcher in `background.ts`
    - Define the `ExtensionMessage` discriminated union type with all message variants:
      `ACTIVITY_START`, `ACTIVITY_STOP`, `QUALITY_CHANGE`, `GET_AGGREGATES`,
      `GET_GRID_FORECAST`, `CLEAR_DATA`, `SET_REGION`, `DISMISS_NUDGE`
    - Register `chrome.runtime.onMessage` listener that routes each message type to its handler
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1_
  - [x] 5.2 Implement the activity lifecycle — start, stop, and quality change
    - On `ACTIVITY_START`: store an in-progress activity record in memory with `startTimestamp`
    - On `ACTIVITY_STOP`: compute `durationSeconds`, call `CarbonCalculator.computeCarbon()`,
      write the completed `ActivityRecord` to IndexedDB within 500 ms
    - On `QUALITY_CHANGE`: close the current segment and open a new one with the updated quality
    - On service worker restart: query IndexedDB for any open sessions and close them with
      estimated duration
    - _Requirements: 3.3, 3.4, 8.1, 13.3_
  - [x] 5.3 Implement rolling aggregate updates
    - After each `writeActivity()` call, update all four aggregate windows (`1h`, `24h`, `7d`,
      `30d`) in IndexedDB, correctly attributing autoplay vs user-initiated video
    - _Requirements: 8.3, 11.1_
  - [x] 5.4 Implement the `chrome.alarms` keep-alive and daily purge trigger
    - Register a 1-minute repeating alarm (`wattwise-keepalive`) on service worker startup
    - Register a daily alarm (`wattwise-purge`) that calls `purgeOldActivities()`
    - On alarm event, re-hydrate in-memory state (grid cache, aggregates) from IndexedDB if cold
    - _Requirements: 8.2, design MV3 lifecycle_
  - [x] 5.5 Implement the `BadgeUpdateMessage` relay to active tabs
    - After each aggregate update, send a `BADGE_UPDATE` message to all tabs that have the
      floating badge content script active
    - Debounce badge updates to at most once every 5 seconds
    - Include `sessionCarbonG`, `autoplayCarbonG`, and optional `comparisonQuality` in the payload
    - _Requirements: 5.1, 5.5_
  - [x] 5.6 Implement `GET_AGGREGATES` and `GET_GRID_FORECAST` response handlers
    - `GET_AGGREGATES`: read all four aggregate records from IndexedDB and return them
    - `GET_GRID_FORECAST`: call `GridClient.getHourlyForecast()` and return the result
    - `SET_REGION`: persist the region code via `setSetting('region', regionCode)`
    - `CLEAR_DATA`: call `clearAllData()` and confirm completion
    - _Requirements: 7.1, 7.4, 8.6_
  - [ ] 5.7 Write integration tests for the service worker message pipeline
    - Use `chrome-mock` or equivalent to simulate the Chrome extension APIs
    - Test the full flow: send `ACTIVITY_START` → `ACTIVITY_STOP` → assert `ActivityRecord`
      written to IndexedDB with correct `gCO2e` and no prohibited fields
    - Test `QUALITY_CHANGE` splits the session into two segments
    - _Requirements: 3.3, 3.4, 8.1, 8.5_
  - [x] 5.8 Checkpoint — run all Service Worker tests
    - Ensure all property tests and unit tests pass (`npm run test`)
    - Load the extension in Chrome and verify the service worker starts without errors
    - Ask the user if any questions arise before proceeding


- [x] 6. Content Scripts — YouTube, Netflix, and AI platforms
  - [x] 6.1 Implement `youtube-cs.ts` — play/pause/stop and quality detection
    - Attach `play`, `pause`, and `ended` event listeners to the `<video>` element
    - On play: send `ACTIVITY_START` with `platform: 'youtube'`, detected quality tier,
      `deviceType`, `connectionType`, and `autoplay` flag
    - On pause/ended: send `ACTIVITY_STOP`
    - Detect autoplay by checking the `data-autoplay` attribute and the "Up Next" overlay DOM
    - _Requirements: 3.1, 3.3, 3.6, 3.7_
  - [x] 6.2 Implement quality detection polling for YouTube
    - Poll the player DOM every 2 seconds during playback for the quality label text
      (e.g., "1080p", "4K") using the priority order from Requirement 3.5
    - Fall back to `video.getVideoPlaybackQuality()` frame statistics if DOM label is absent
    - Default to `1080p` if neither source is available
    - On quality change, send `QUALITY_CHANGE` message to the service worker
    - _Requirements: 3.4, 3.5_
  - [x] 6.3 Implement `netflix-cs.ts` — play/pause/stop, quality detection, and autoplay
    - Mirror the YouTube content script structure for Netflix DOM selectors
    - Detect autoplay via the post-play countdown overlay in the Netflix DOM
    - Apply the same quality detection priority order (DOM label → playback quality API → 1080p)
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [x] 6.4 Implement `ai-cs.ts` — prompt submission detection for ChatGPT, Claude, and Gemini
    - Attach `submit` and `keydown(Enter)` listeners to the prompt form on each platform
    - On submission: read `textContent.length` of the input field; send `ACTIVITY_START` with
      `platform`, `timestamp`, and `characterCount`; do NOT capture or store the prompt text
    - If the prompt input field is not detectable, log a local detection failure and skip the
      event (do not emit incomplete data)
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 6.5 Implement port-based keep-alive for the service worker
    - During active video playback, open a `chrome.runtime.connect` port from the content script
    - Close the port when playback stops or the tab is hidden
    - _Requirements: design MV3 lifecycle_
  - [ ]* 6.6 Write integration tests for content script activity detection
    - Use jsdom with mocked `<video>` elements to simulate play/pause/quality-change events
    - Assert that the correct `ExtensionMessage` types are sent to the service worker for each
      event
    - Test autoplay detection for both YouTube and Netflix DOM patterns
    - Test that AI prompt detection captures `characterCount` but not prompt text
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 4.1, 4.2_
  - [ ]* 6.7 Write property test for AI prompt privacy (Property 16)
    - **Property 16: AI prompt character count is captured but prompt text is not**
    - Generate arbitrary prompt strings via fast-check; simulate submission; assert that the
      emitted `ActivityStartPayload` contains `characterCount >= 0` and does NOT contain the
      prompt text or any substring of it
    - **Validates: Requirements 4.2**
  - [x] 6.8 Checkpoint — load extension on YouTube and Netflix
    - Load the unpacked extension in Chrome
    - Play a video on YouTube and Netflix; verify `ACTIVITY_START` and `ACTIVITY_STOP` messages
      appear in the service worker console
    - Submit a prompt on ChatGPT; verify the activity event is logged
    - Ask the user if any questions arise before proceeding


- [x] 7. Floating Badge — Shadow DOM injection, live updates, and quality comparison
  - [x] 7.1 Create the `floating-badge.tsx` React component
    - Render the session carbon total in gCO₂e; switch to kg display when `sessionCarbonG >= 100`
    - Position the badge bottom-right by default; load saved position from `chrome.storage.local`
    - Implement drag-to-reposition and persist the new position on drag end
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 7.2 Inject the badge into active tabs via Shadow DOM
    - Create a content script (`badge-cs.ts`) that injects a Shadow DOM host element into the
      page body
    - Mount the React `FloatingBadge` component inside the shadow root to prevent style leakage
    - Handle CSP-blocked injection gracefully: catch the error, skip badge injection, and allow
      tracking to continue
    - _Requirements: 5.2, design error handling_
  - [x] 7.3 Implement badge dismissal
    - Add a dismiss button that sets `dismissed: true` in component state
    - Dismissed state is per-tab-session only (not persisted to IndexedDB or storage)
    - _Requirements: 5.4_
  - [x] 7.4 Implement quality comparison display in the badge
    - When `comparisonQuality` is present in `BadgeState`, render the lower-tier cost alongside
      the current tier (e.g., "4K: 0.42 kg | 1080p: 0.15 kg")
    - Only show when the user has enabled the quality comparison setting
    - _Requirements: 5.5_
  - [x] 7.5 Implement the autoplay indicator
    - When `autoplayCarbonG` exceeds 10 gCO₂e in the current session, display a one-time
      indicator showing the autoplay carbon total
    - Show the indicator at most once per tab session
    - _Requirements: 11.3_
  - [x] 7.6 Wire the badge to `BadgeUpdateMessage` from the service worker
    - Listen for `BADGE_UPDATE` messages in `badge-cs.ts` and update the React component state
    - Updates arrive at most every 5 seconds (debounced by the service worker)
    - _Requirements: 5.1_
  - [ ]* 7.7 Write unit tests for the FloatingBadge component
    - Test unit switching: assert "g" display below 100 gCO₂e and "kg" display at and above 100
    - Test dismissal: assert badge is hidden after dismiss button click
    - Test quality comparison: assert both tier costs are rendered when `comparisonQuality` is set
    - Test autoplay indicator: assert it appears once when `autoplayCarbonG > 10`
    - _Requirements: 5.3, 5.4, 5.5, 11.3_
  - [ ]* 7.8 Write property test for badge unit switching (Property 15)
    - **Property 15: Badge unit switches at 100 gCO₂e threshold**
    - Generate arbitrary `sessionCarbonG` values via fast-check; assert that values < 100 render
      in grams and values >= 100 render in kilograms
    - **Validates: Requirements 5.3**
  - [x] 7.9 Checkpoint — verify badge on a live streaming tab
    - Load the extension; play a video on YouTube; verify the badge appears and updates
    - Verify the badge does not obscure video playback controls
    - Ask the user if any questions arise before proceeding


- [x] 8. Ethics Gate — declarativeNetRequest rules and webRequest payload inspection
  - [x] 8.1 Create the `declarativeNetRequest` rule set
    - Write `src/ethics-gate/rules.json` with a rule that blocks all outbound requests from the
      extension whose destination is not `api.electricitymap.org` or `api.eia.gov`
    - Reference the rules file in `manifest.json` under `declarative_net_request`
    - _Requirements: 9.1, 9.2, 9.6_
  - [x] 8.2 Implement the `chrome.webRequest.onBeforeRequest` payload inspector
    - Register the observer in `background.ts` for all requests matching the allowlisted domains
    - Inspect the request body for PII patterns: URL fragments, hostnames, page titles, tab IDs,
      user identifiers, GPS coordinates, IP addresses, email addresses, phone numbers, and
      timestamps narrower than one hour
    - Use regex patterns for each PII category
    - _Requirements: 9.3_
  - [x] 8.3 Implement violation logging
    - On PII detection: write a `ViolationRecord` to IndexedDB with `timestamp`,
      `blockedDestination`, and `ruleViolated`; set `acknowledged: false`
    - Expose a `getUnacknowledgedViolations()` helper for the popup to query
    - Implement `acknowledgeViolation(id: number)` to set `acknowledged: true`
    - _Requirements: 9.4, 9.5_
  - [x] 8.4 Implement the allowlisted request payload validator
    - `validateAllowlistedPayload(payload: unknown): boolean` — returns true only if the payload
      contains exclusively `regionCode`, a timestamp rounded to the nearest hour, and an API
      authentication token
    - _Requirements: 9.7_
  - [ ]* 8.5 Write property test for Ethics Gate allowlist enforcement (Property 8)
    - **Property 8: Ethics Gate blocks all non-allowlisted destinations**
    - Generate arbitrary destination URLs via fast-check; assert that any URL whose domain is
      not `api.electricitymap.org` or `api.eia.gov` is blocked, regardless of method, path,
      or payload
    - **Validates: Requirements 9.2**
  - [ ]* 8.6 Write property test for allowlisted payload validation (Property 9)
    - **Property 9: Allowlisted request payloads contain only permitted fields**
    - Generate arbitrary payload objects via fast-check; assert that `validateAllowlistedPayload()`
      returns false for any payload containing a URL fragment, hostname, page title, tab ID,
      user identifier, GPS coordinate, IP address, or PII pattern
    - Assert it returns true only for payloads with exactly `regionCode`, rounded timestamp, and
      API token
    - **Validates: Requirements 9.3, 9.7, 2.6**
  - [ ]* 8.7 Write unit tests for PII pattern detection
    - Test each PII category with representative examples: email addresses, phone numbers,
      IP addresses, GPS coordinates, URL fragments, tab IDs
    - Test that valid payloads (region code + rounded timestamp + token) pass inspection
    - _Requirements: 9.3_
  - [x] 8.8 Checkpoint — verify Ethics Gate in Chrome
    - Load the extension; open DevTools Network tab; verify that no requests are made to
      non-allowlisted domains
    - Trigger a grid intensity fetch; verify the request payload contains only the region code
      and rounded timestamp
    - Ask the user if any questions arise before proceeding


- [x] 9. Popup Dashboard — React UI, all panels, and settings
  - [x] 9.1 Set up the popup React app entry point
    - Create `src/popup/index.html` and `src/popup/main.tsx`
    - Configure Vite to build the popup as a separate entry point
    - Set the popup dimensions to 400 × 600 px in CSS
    - _Requirements: 7.7_
  - [x] 9.2 Implement the Summary panel
    - Read session, today, 7-day, and 30-day totals directly from IndexedDB via Dexie
      (no service worker round-trip)
    - Display all four totals in gCO₂e
    - _Requirements: 7.1, 7.7_
  - [x] 9.3 Implement the 7-day bar chart panel
    - Use Recharts `BarChart` to render daily carbon totals for the past 7 days
    - Read data directly from IndexedDB
    - _Requirements: 7.2_
  - [x] 9.4 Implement the Activity Breakdown panel
    - Display carbon attributed to: video streaming (user-initiated), video streaming (autoplay),
      AI prompts, video calls, and page loads
    - Show both absolute gCO₂e values and percentage of total
    - Display the autoplay bucket as a distinct line item
    - _Requirements: 7.3, 11.2_
  - [x] 9.5 Implement the Grid Schedule panel
    - Send `GET_GRID_FORECAST` to the service worker and render the 24-hour forecast
    - Highlight the lowest-carbon window
    - _Requirements: 7.4_
  - [x] 9.6 Implement the Comparison Anchors panel
    - Call `toComparisonAnchors()` with the 30-day total
    - Select the two most relatable anchors (non-fractional, non-astronomical values)
    - _Requirements: 7.5, 12.2_
  - [x] 9.7 Implement the Savings panel
    - Display total gCO₂e avoided by choosing lower quality tiers (if quality comparison is
      enabled)
    - Show the equivalent comparison anchor for the savings total
    - _Requirements: 7.6_
  - [x] 9.8 Implement the Settings panel
    - Region code input: send `SET_REGION` message on save
    - Activity category toggles: persist via `setSetting('categories', ...)`
    - Violations log: display all `ViolationRecord` entries; allow acknowledgement
    - Non-dismissable violation banner: show when any unacknowledged violations exist
    - Clear data button: send `CLEAR_DATA` message and confirm completion
    - _Requirements: 7.8, 9.4, 9.5, 8.6_
  - [x] 9.9 Implement the "Complete setup" prompt for incomplete onboarding
    - On popup open, check `getSetting('onboardingComplete')`; if false, display a persistent
      prompt linking to the onboarding tab
    - _Requirements: 10.4_
  - [ ]* 9.10 Write unit tests for all popup panels
    - Test Summary panel renders correct totals from mocked IndexedDB data
    - Test Activity Breakdown shows autoplay as a distinct line item
    - Test Settings panel persists region code and category toggles
    - Test violation banner is non-dismissable until acknowledged in settings
    - Test popup loads within 500 ms (measure with `performance.now()` in the test)
    - _Requirements: 7.1, 7.3, 7.7, 7.8, 9.5_
  - [x] 9.11 Checkpoint — verify popup in Chrome
    - Click the extension icon; verify all panels render correctly
    - Verify the popup loads within 500 ms
    - Ask the user if any questions arise before proceeding


- [x] 10. Onboarding — 3-screen flow and region setup
  - [x] 10.1 Create the onboarding tab React app entry point
    - Create `src/onboarding/index.html` and `src/onboarding/main.tsx`
    - Register an `chrome.runtime.onInstalled` listener in `background.ts` that opens the
      onboarding tab on first install (when `onboardingComplete` setting is absent)
    - _Requirements: 10.1_
  - [x] 10.2 Implement Screen 1 — Permissions explanation
    - Display the list of browser permissions requested and a plain-language explanation of why
      each is needed
    - Include a "Next" button to advance to Screen 2
    - _Requirements: 10.2_
  - [x] 10.3 Implement Screen 2 — Region selection
    - Render a searchable dropdown or text input for the Region_Code
    - On selection, validate the format and preview the current grid intensity if available
    - Include "Back" and "Next" buttons
    - _Requirements: 10.2, 10.3_
  - [x] 10.4 Implement Screen 3 — Privacy statement
    - Display the explicit statement that browsing history never leaves the device
    - List the two allowlisted API domains
    - Include a "Get started" button that calls `setSetting('onboardingComplete', true)` and
      `setSetting('region', selectedRegionCode)`, then closes the tab
    - _Requirements: 10.2, 10.3_
  - [x] 10.5 Implement incomplete-onboarding fallback
    - If the onboarding tab is closed before "Get started" is clicked, `onboardingComplete`
      remains `false`; the extension uses 475 gCO₂e/kWh and the popup shows the setup prompt
    - _Requirements: 10.4_
  - [ ]* 10.6 Write unit tests for the onboarding flow
    - Test that all three screens render in order
    - Test that region code is persisted on completion
    - Test that closing the tab without completing leaves `onboardingComplete: false`
    - Test that the full flow is completable without account creation or personal information
    - _Requirements: 10.1, 10.3, 10.4, 10.5_
  - [x] 10.7 Checkpoint — verify onboarding in Chrome
    - Remove and reinstall the extension; verify the onboarding tab opens automatically
    - Complete the flow; verify the region code is saved and tracking begins
    - Ask the user if any questions arise before proceeding


- [x] 11. Scheduler Nudge — 24-hour forecast, nudge banner, and cooldown
  - [x] 11.1 Implement the nudge evaluation logic in the service worker
    - On `ACTIVITY_START` for a video activity, check `durationSeconds > 20 * 60`
    - Call `GridClient.getHourlyForecast()` for the next 24 hours
    - Find the hour with the lowest grid intensity; compute the carbon saving percentage
    - Surface a nudge only if savings >= 30% AND grid confidence is "medium" or "high"
    - _Requirements: 6.1, 6.2, 6.6_
  - [x] 11.2 Implement the nudge banner message and buttons
    - Send a `NUDGE_SHOW` message to the active tab with the formatted message:
      "This [duration]-min session = [current_g]g now. Shift to [best_hour] = [best_g]g
      ([savings_pct]% less)."
    - Include a "Remind me" button that calls `chrome.notifications.create()` for the
      suggested time
    - Include a "Dismiss" button that sends `DISMISS_NUDGE` to the service worker
    - Ensure the banner does not block video playback or any other user action
    - _Requirements: 6.2, 6.3, 6.5_
  - [x] 11.3 Implement nudge cooldown enforcement
    - On `DISMISS_NUDGE`: store `{ activityType, dismissedAt: Date.now() }` via
      `setSetting('nudgeCooldowns', ...)`
    - Before surfacing a nudge, check if the cooldown for that activity type has expired
      (2-hour window)
    - _Requirements: 6.4_
  - [ ]* 11.4 Write property test for nudge threshold correctness (Property 13)
    - **Property 13: Scheduler nudge fires if and only if a 30% savings window exists**
    - Generate arbitrary 24-hour grid intensity forecasts and current intensities via fast-check;
      assert that a nudge is triggered if and only if at least one future hour reduces carbon
      cost by >= 30% AND confidence is "medium" or "high"
    - **Validates: Requirements 6.1, 6.2, 6.6**
  - [ ]* 11.5 Write property test for nudge cooldown (Property 14)
    - **Property 14: Nudge cooldown prevents repeat nudges within 2 hours**
    - Generate arbitrary sequences of dismiss events and subsequent activity starts via
      fast-check; assert that no nudge is surfaced for the same activity type within 2 hours
      of a dismiss event
    - **Validates: Requirements 6.4**
  - [ ]* 11.6 Write unit tests for the nudge banner component
    - Test that the banner renders the correct message format with all interpolated values
    - Test that "Remind me" triggers a Chrome notification for the correct time
    - Test that "Dismiss" sends the `DISMISS_NUDGE` message
    - Test that the banner is non-blocking (rendered as an overlay, not a modal)
    - _Requirements: 6.2, 6.3, 6.5_
  - [x] 11.7 Checkpoint — verify nudge in Chrome
    - Start a video longer than 20 minutes in a region with variable grid intensity
    - Verify the nudge banner appears when a 30% savings window exists
    - Verify dismissal suppresses the nudge for 2 hours
    - Ask the user if any questions arise before proceeding


- [x] 12. End-to-end integration and performance validation
  - [x] 12.1 Write end-to-end integration tests for the full activity pipeline
    - Use `chrome-mock` to simulate the complete flow: content script detects play event →
      service worker receives `ACTIVITY_START` → grid intensity fetched → carbon computed →
      `ActivityRecord` written to IndexedDB → aggregates updated → badge receives `BADGE_UPDATE`
    - Test the quality-change mid-session flow: two segments with different quality tiers are
      stored as separate records with correct durations
    - Test the autoplay attribution flow: autoplay records appear in `videoAutoplayGCO2e` only
    - _Requirements: 3.1, 3.4, 8.1, 8.3, 11.1_
  - [x] 12.2 Write privacy regression tests
    - For every code path that writes an `ActivityRecord`, assert that the record does not
      contain `url`, `pageTitle`, `tabId`, `promptText`, or `ipAddress`
    - Run these tests as part of CI on every commit
    - _Requirements: 8.5_
  - [x] 12.3 Implement and measure content script injection performance
    - Wrap the content script initialisation in `performance.now()` timing
    - Write a test that asserts initialisation completes in <= 50 ms on a simulated mid-range
      environment
    - _Requirements: 13.1_
  - [x] 12.4 Implement and measure service worker event processing performance
    - Measure the time from `ACTIVITY_STOP` receipt to `writeActivity()` completion
    - Write a test that asserts the end-to-end processing time is <= 500 ms
    - _Requirements: 13.3_
  - [x] 12.5 Implement and measure popup load performance
    - Wrap the popup's `DOMContentLoaded` handler in `performance.now()` timing
    - Write a test that asserts the popup renders all panels within 500 ms using pre-seeded
      IndexedDB data
    - _Requirements: 7.7, 13_
  - [ ]* 12.6 Write integration tests for the Ethics Gate end-to-end
    - Simulate a content script attempting to send a request to a non-allowlisted domain;
      assert the request is blocked and a `ViolationRecord` is written to IndexedDB
    - Simulate a grid intensity fetch; assert the request payload contains only the permitted
      fields and passes the payload validator
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 12.7 Final checkpoint — full extension smoke test in Chrome
    - Load the extension; complete onboarding; play videos on YouTube and Netflix; submit
      prompts on ChatGPT; open the popup and verify all panels display correct data
    - Verify the Ethics Gate blocks no legitimate requests and logs no false-positive violations
    - Verify memory usage in the service worker process is <= 5 MB while the popup is closed
    - Ensure all automated tests pass (`npm run test`)
    - Ask the user if any questions arise before proceeding

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP build
- Each task group ends with a checkpoint that produces a loadable, testable state in Chrome
- Property tests validate universal correctness properties using fast-check (minimum 100 runs)
- Unit tests validate specific examples, edge cases, and UI component behaviour
- All property tests reference the design document property number they validate
- Privacy regression tests (Task 12.2) run on every commit as part of CI
- The popup reads all data directly from IndexedDB — no service worker round-trip — to meet
  the 500 ms load requirement (Requirement 7.7)
- The service worker uses `chrome.alarms` + port-based keep-alive to survive MV3 termination
