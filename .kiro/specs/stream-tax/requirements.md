# Requirements Document

## Introduction

WattWise is a Chrome extension (Manifest V3) that makes the carbon footprint of digital activities
visible in real time and helps users reduce emissions through two complementary levers: quality
selection (e.g., 1080p vs 4K) and grid-time intelligence (shifting carbon-heavy activities to
hours when the local electricity grid is cleaner). The extension operates entirely on-device —
no browsing history, URLs, or page titles ever leave the user's machine. Outbound network calls
are restricted to two allowlisted APIs (ElectricityMaps, EIA) and carry only a region code.

The extension targets Chrome on desktop (laptop, desktop) and covers video streaming
(YouTube, Netflix), AI prompt interfaces (ChatGPT, Claude, Gemini), and generic web pages.
Video calls (Zoom, Meet) and additional platforms are out of scope for the initial release.

---

## Glossary

- **Activity**: A discrete user action tracked for carbon estimation — video playback, AI prompt
  submission, video call minute, page load, or background tab idle time.
- **Carbon_Calculator**: The on-device module that converts activity data and grid intensity into
  grams of CO₂ equivalent (gCO₂e).
- **Content_Script**: A per-platform JavaScript module injected into a streaming or AI site to
  detect activity events and quality settings.
- **Ethics_Gate**: The service-worker-level enforcement layer that inspects and allowlists all
  outbound network requests, blocking any request that would transmit user data.
- **Extension**: The WattWise Chrome extension as a whole.
- **Floating_Badge**: The small, always-visible overlay rendered on active tabs showing the
  running session carbon total.
- **Grid_Client**: The module responsible for fetching and caching regional grid carbon intensity
  from ElectricityMaps or EIA.
- **Grid_Intensity**: The carbon intensity of the local electricity grid at a given hour, measured
  in gCO₂e per kWh.
- **IndexedDB_Store**: The local browser database (accessed via Dexie.js) that persists the
  activity log and rolling aggregates.
- **Popup_Dashboard**: The React-based UI shown when the user clicks the extension icon, displaying
  historical carbon data, activity breakdown, and the grid schedule.
- **Region_Code**: An ISO-style zone identifier (e.g., "US-AZ-SRP") representing the user's
  electricity grid zone. Never includes GPS coordinates or IP address.
- **Scheduler_Nudge**: A non-blocking banner surfaced before or during a long activity that
  suggests a lower-carbon time window for the same activity.
- **Service_Worker**: The Manifest V3 background service worker that aggregates activity events,
  manages the Grid_Client, enforces the Ethics_Gate, and writes to IndexedDB_Store.
- **Session**: The period from extension load (or browser start) until the browser is closed or
  the extension is disabled.
- **Violation**: An outbound network request blocked by the Ethics_Gate because it failed the
  allowlist or payload inspection rules.

---

## Requirements

### Requirement 1: Carbon Calculation

**User Story:** As a user, I want the extension to calculate the carbon footprint of my digital
activities accurately, so that I can understand the real environmental cost of my browsing.

#### Acceptance Criteria

1. THE Carbon_Calculator SHALL compute session carbon in gCO₂e using the formula:
   `session_carbon_g = Σ (kWh_per_activity(type, duration, quality, device, connection) × grid_intensity_gCO2e_per_kWh(region, timestamp))`.

2. WHEN computing video streaming energy, THE Carbon_Calculator SHALL apply the following
   data-rate multipliers per hour: 480p → 0.5 GB, 720p → 1.5 GB, 1080p → 3 GB, 4K → 7 GB,
   and multiply by 0.077 kWh/GB for fixed-line connections (Carbon Trust 2021).

3. WHEN the connection type is cellular (4G), THE Carbon_Calculator SHALL apply an energy
   intensity of 0.21 kWh/GB instead of the fixed-line value (IEA 2022).

4. WHEN computing device energy, THE Carbon_Calculator SHALL add device power draw at the
   following rates: laptop → 30 W, desktop → 45 W, smartphone → 3 W, TV (55" LCD) → 95 W.

5. WHEN computing AI prompt energy, THE Carbon_Calculator SHALL estimate token count from
   visible character count using a 4-characters-per-token heuristic and apply 0.3 Wh per
   1,000 tokens (Ren et al., 2023).

6. WHEN computing video call energy, THE Carbon_Calculator SHALL apply 0.002 kWh per minute
   of active call (Obringer et al., 2021).

7. WHEN computing page-load energy, THE Carbon_Calculator SHALL apply a baseline of 1 gCO₂e
   per page load (Sustainable Web Design model).

8. THE Carbon_Calculator SHALL expose a quality comparison function that, given an activity
   and two quality tiers, returns the gCO₂e for each tier and the percentage difference.

9. FOR ALL valid Activity inputs, THE Carbon_Calculator SHALL produce a non-negative gCO₂e
   value.

10. FOR ALL valid Activity inputs, THE Carbon_Calculator SHALL produce results consistent with
    the IEA 2022 streaming estimates within a 15% tolerance when using the global average
    grid intensity of 475 gCO₂e/kWh.

---

### Requirement 2: Grid Intensity Lookup

**User Story:** As a user, I want the extension to use real-time local grid data, so that my
carbon estimates reflect the actual cleanliness of my electricity at the current hour.

#### Acceptance Criteria

1. WHEN a grid intensity value is needed, THE Grid_Client SHALL first query the ElectricityMaps
   API `/v3/carbon-intensity/latest` endpoint with the user's Region_Code.

2. IF the ElectricityMaps API is unreachable or returns an error, THEN THE Grid_Client SHALL
   fall back to the EIA Hourly Grid Monitor API for US regions.

3. IF both APIs are unreachable, THEN THE Grid_Client SHALL use the static hourly fallback
   table for the user's region, which includes pre-computed hourly curves for the top 20 US
   grid zones.

4. THE Grid_Client SHALL cache each API response for 15 minutes per Region_Code, making at
   most one outbound call per region per 15-minute window.

5. WHEN returning a grid intensity value, THE Grid_Client SHALL include the source
   ("electricitymaps" | "eia" | "static_fallback") and a confidence level
   ("high" | "medium" | "low") in the response.

6. THE Grid_Client SHALL never include GPS coordinates, IP addresses, URLs, or page titles
   in any API request — only the Region_Code and timestamp rounded to the nearest hour.

7. WHEN the user has not configured a Region_Code, THE Grid_Client SHALL use a global average
   of 475 gCO₂e/kWh and surface a one-time prompt in the Popup_Dashboard asking the user to
   set their region.

---

### Requirement 3: Activity Detection — Video Streaming

**User Story:** As a user, I want the extension to automatically detect when I am watching
video and at what quality, so that I do not have to manually log my streaming activity.

#### Acceptance Criteria

1. WHEN a user plays a video on YouTube, THE Content_Script SHALL detect the playback event
   and emit an activity event to the Service_Worker containing: platform, start timestamp,
   detected quality tier, device type, and connection type.

2. WHEN a user plays a video on Netflix, THE Content_Script SHALL detect the playback event
   and emit an equivalent activity event to the Service_Worker.

3. WHEN a user pauses or stops a video, THE Content_Script SHALL emit a stop event so that
   THE Service_Worker can close the activity duration.

4. WHEN the video quality changes during playback, THE Content_Script SHALL emit a quality-
   change event so that THE Carbon_Calculator can split the session into segments with
   accurate per-segment energy.

5. WHEN detecting video quality, THE Content_Script SHALL apply the following priority
   order: (1) read the quality label from the player UI DOM (e.g., "1080p", "4K" text
   rendered in the player settings or quality indicator); (2) IF the DOM quality label is
   not available, THEN THE Content_Script SHALL use `video.getVideoPlaybackQuality()` as a
   secondary signal (frame statistics only — not resolution); (3) IF neither source is
   available, THEN THE Content_Script SHALL default to 1080p as the quality tier.

6. WHEN a video is auto-played by the platform without explicit user action (e.g., Netflix
   Post-Play, YouTube endcard), THE Content_Script SHALL tag the activity event with
   `autoplay: true` so that THE Service_Worker can attribute it to the "content you didn't
   choose" bucket.

7. THE Content_Script SHALL detect video activity on YouTube and Netflix without requiring
   the user to grant access to browsing history, page content, or any data beyond the
   presence of a video element on the page.

---

### Requirement 4: Activity Detection — AI Prompts

**User Story:** As a user, I want the extension to track the carbon cost of my AI prompt
usage, so that I can see the full picture of my digital footprint beyond video.

#### Acceptance Criteria

1. WHEN a user submits a prompt on chat.openai.com, claude.ai, or gemini.google.com, THE
   Content_Script SHALL detect the submission event and emit an activity event containing:
   platform, timestamp, and estimated character count of the prompt.

2. THE Content_Script SHALL estimate character count from the visible text in the prompt
   input field at the time of submission and SHALL NOT capture or transmit the prompt text
   itself.

3. IF the prompt input field is not detectable due to DOM changes, THEN THE Content_Script
   SHALL log a detection failure locally and skip the activity event rather than emitting
   incomplete data.

---

### Requirement 5: Floating Badge

**User Story:** As a user, I want to see a live carbon counter while I browse, so that I
have constant awareness of my session footprint without opening the extension popup.

#### Acceptance Criteria

1. WHILE a video is playing or an AI prompt session is active, THE Floating_Badge SHALL
   display the running session carbon total in gCO₂e, updated at most every 5 seconds.

2. THE Floating_Badge SHALL be positioned in a corner of the viewport and SHALL NOT obscure
   video playback controls or primary page content.

3. WHEN the session carbon total crosses 100 gCO₂e, THE Floating_Badge SHALL switch its
   display unit to kg CO₂e (e.g., "0.10 kg").

4. THE Floating_Badge SHALL be dismissible by the user for the current tab session without
   disabling the underlying tracking.

5. WHERE the user has enabled the quality comparison setting, THE Floating_Badge SHALL also
   display the carbon cost of the next-lower quality tier alongside the current tier cost
   (e.g., "4K: 0.42 kg | 1080p: 0.15 kg").

---

### Requirement 6: Scheduler Nudge

**User Story:** As a user, I want to be told when a lower-carbon time window exists for my
planned activity, so that I can shift timing and reduce my footprint without changing my
behavior.

#### Acceptance Criteria

1. WHEN a user starts a video longer than 20 minutes, THE Service_Worker SHALL compute the
   grid intensity for the current hour and for each of the next 23 hours in the user's region.

2. IF a future hour within the next 24 hours has a grid intensity that would reduce the
   activity's carbon cost by 30% or more, THEN THE Service_Worker SHALL surface a
   Scheduler_Nudge banner with the message format:
   "This [duration]-min session = [current_g]g now. Shift to [best_hour] = [best_g]g
   ([savings_pct]% less)."

3. THE Scheduler_Nudge SHALL include a "Remind me" button that sets a browser notification
   for the suggested time and a "Dismiss" button that closes the nudge.

4. WHEN the user dismisses a Scheduler_Nudge for a given activity type, THE Service_Worker
   SHALL not surface another nudge for that activity type for the next 2 hours.

5. THE Scheduler_Nudge SHALL be non-blocking — it SHALL NOT prevent video playback or any
   other user action.

6. THE Scheduler_Nudge SHALL only be surfaced when the Grid_Client has a confidence level
   of "medium" or "high" for the current region's grid data.

---

### Requirement 7: Popup Dashboard

**User Story:** As a user, I want a dashboard that shows my carbon history and activity
breakdown, so that I can understand my cumulative impact and track progress over time.

#### Acceptance Criteria

1. WHEN the user opens the Popup_Dashboard, THE Popup_Dashboard SHALL display: session
   carbon total, today's total, 7-day total, and 30-day total in gCO₂e.

2. THE Popup_Dashboard SHALL display a bar chart of daily carbon totals for the past 7 days.

3. THE Popup_Dashboard SHALL display an activity breakdown showing carbon attributed to:
   video streaming (user-initiated), video streaming (autoplay), AI prompts, video calls,
   and page loads — as both absolute gCO₂e values and percentage of total.

4. THE Popup_Dashboard SHALL display a grid schedule panel showing the projected grid
   intensity for each hour of the next 24 hours in the user's region, highlighting the
   lowest-carbon window.

5. THE Popup_Dashboard SHALL display comparison anchors that translate the 30-day total
   into relatable units, including: equivalent Google searches, equivalent miles not driven,
   and equivalent phone charges.

6. WHERE the user has saved carbon by choosing a lower quality tier, THE Popup_Dashboard
   SHALL display a "savings" counter showing total gCO₂e avoided and the equivalent
   comparison anchor.

7. THE Popup_Dashboard SHALL load and render within 500 ms of the user clicking the
   extension icon, reading all data from IndexedDB_Store without making network calls.

8. THE Popup_Dashboard SHALL include a settings panel where the user can: set their
   Region_Code, toggle activity categories on or off, and view the Violations log.

---

### Requirement 8: Local Data Persistence

**User Story:** As a user, I want my carbon history to be stored locally and retained across
browser sessions, so that I can track my progress over time without creating an account.

#### Acceptance Criteria

1. THE Service_Worker SHALL write activity events to IndexedDB_Store within 30 seconds of
   receiving them from Content_Scripts.

2. THE IndexedDB_Store SHALL retain the full activity log for a rolling 30-day window,
   automatically purging records older than 30 days.

3. THE Service_Worker SHALL maintain pre-computed rolling aggregates (1-hour, 24-hour,
   7-day, 30-day totals) in IndexedDB_Store and update them whenever a new activity event
   is committed.

4. THE IndexedDB_Store SHALL store activity records with the following fields: activity
   type, platform, duration_seconds, quality tier, device type, connection type, gCO₂e,
   grid intensity used, grid intensity source, autoplay flag, and timestamp rounded to the
   nearest minute.

5. THE IndexedDB_Store SHALL NOT store URLs, page titles, tab IDs, prompt text, or any
   other content that could identify the specific pages the user visited.

6. WHEN the user clears extension data from the settings panel, THE Service_Worker SHALL
   delete all records from IndexedDB_Store and reset all aggregates to zero within 5
   seconds.

---

### Requirement 9: Ethics Gate

**User Story:** As a user, I want a verifiable guarantee that my browsing data never leaves
my device, so that I can trust the extension with my privacy.

#### Acceptance Criteria

1. THE Ethics_Gate SHALL intercept all outbound network requests made by the Extension
   before they are sent.

2. THE Ethics_Gate SHALL block any request whose destination is not in the allowlist:
   `api.electricitymap.org` and `api.eia.gov`.

3. THE Ethics_Gate SHALL inspect the payload of every allowlisted request and SHALL block
   the request if the payload contains any of the following: a URL or URL fragment, a
   hostname, a page title, a tab ID, a user identifier, a timestamp narrower than one hour,
   GPS coordinates, an IP address, or any string matching common PII patterns (email,
   phone number).

4. WHEN a request is blocked by the Ethics_Gate, THE Ethics_Gate SHALL log the violation
   to a local violations log with: timestamp, blocked destination, and the rule that was
   violated.

5. WHEN a Violation is logged, THE Popup_Dashboard SHALL display a non-dismissable banner
   reading: "A network request was blocked by the Ethics Gate: [rule_violated]" until the
   user acknowledges it in the settings panel.

6. THE Ethics_Gate SHALL enforce the allowlist and payload inspection rules at the
   service-worker level using the `chrome.webRequest` or `declarativeNetRequest` API,
   ensuring enforcement cannot be bypassed by Content_Scripts.

7. FOR ALL outbound requests that pass the Ethics_Gate, THE Ethics_Gate SHALL confirm that
   the payload contains only: a Region_Code, a timestamp rounded to the nearest hour, and
   the API authentication token.

---

### Requirement 10: Onboarding

**User Story:** As a new user, I want a brief setup flow when I first install the extension,
so that I can configure my region and understand what the extension does and does not collect.

#### Acceptance Criteria

1. WHEN the Extension is installed for the first time, THE Extension SHALL open a 3-screen
   onboarding flow in a new tab.

2. THE onboarding flow SHALL include: (1) a permissions screen explaining what browser
   permissions are requested and why, (2) a region selection screen where the user sets
   their Region_Code, and (3) a privacy screen explicitly stating that browsing history
   never leaves the device and listing the two allowlisted API domains.

3. WHEN the user completes onboarding, THE Extension SHALL store the selected Region_Code
   in IndexedDB_Store and begin activity tracking.

4. IF the user closes the onboarding tab without completing it, THEN THE Extension SHALL
   use the global average grid intensity (475 gCO₂e/kWh) and surface a prompt in the
   Popup_Dashboard to complete setup.

5. THE onboarding flow SHALL be completable in under 2 minutes without requiring the user
   to create an account or provide any personal information.

---

### Requirement 11: Autoplay Auditor

**User Story:** As a user, I want to see how much carbon was consumed by content I didn't
choose to play, so that I can understand the hidden cost of autoplay features.

#### Acceptance Criteria

1. WHEN a video is auto-played by the platform (tagged with `autoplay: true`), THE
   Service_Worker SHALL attribute its carbon to a separate "content you didn't choose"
   bucket in IndexedDB_Store.

2. THE Popup_Dashboard SHALL display the autoplay bucket as a distinct line item in the
   activity breakdown, separate from user-initiated video.

3. WHEN the autoplay bucket exceeds 10 gCO₂e in a single session, THE Floating_Badge SHALL
   display a one-time indicator showing the autoplay carbon total for that session.

---

### Requirement 12: Comparison Anchors

**User Story:** As a user, I want my carbon totals expressed in relatable terms, so that
abstract gram values become meaningful to me.

#### Acceptance Criteria

1. THE Carbon_Calculator SHALL provide a translation function that converts a gCO₂e value
   into the following comparison anchors: Google searches (1 search ≈ 0.2 gCO₂e), miles
   not driven (1 mile ≈ 404 gCO₂e), phone charges (1 charge ≈ 8.22 gCO₂e), and kettles
   boiled (1 kettle ≈ 50 gCO₂e).

2. THE Popup_Dashboard SHALL display at least two comparison anchors for the 30-day total,
   selecting the anchors that produce the most relatable (non-fractional, non-astronomical)
   values for the user's actual total.

3. FOR ALL non-negative gCO₂e inputs, THE Carbon_Calculator's translation function SHALL
   return non-negative, finite anchor values.

---

### Requirement 13: Extension Performance

**User Story:** As a user, I want the extension to have negligible impact on browser
performance, so that it does not slow down my streaming or browsing experience.

#### Acceptance Criteria

1. THE Content_Script SHALL add no more than 50 ms of JavaScript execution time per page
   load on a mid-range laptop (Intel Core i5, 8 GB RAM).

2. THE Floating_Badge SHALL consume no more than 1% of CPU on a mid-range laptop during
   active video playback.

3. THE Service_Worker SHALL process and commit an activity event to IndexedDB_Store within
   500 ms of receiving it.

4. THE Extension SHALL not make any network requests during video playback other than the
   Grid_Client's cached 15-minute interval calls.

5. WHILE the Popup_Dashboard is closed, THE Extension SHALL consume no more than 5 MB of
   memory in the Service_Worker process.
