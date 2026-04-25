---
inclusion: always
---

# Privacy Rules

What data never leaves the device. These rules are absolute — no exceptions.

## Data That NEVER Leaves the Device

| Data Category | Examples | Status |
|---------------|----------|--------|
| Browsing history | URLs visited, page titles | ❌ Never transmitted |
| Tab identifiers | Tab IDs, window IDs | ❌ Never transmitted |
| Prompt text | AI prompt content, partial text | ❌ Never transmitted |
| Page content | DOM content, text on page | ❌ Never transmitted |
| User identity | Name, email, account ID | ❌ Never transmitted |
| Precise location | GPS coordinates, IP address | ❌ Never transmitted |
| Activity log | Full history, raw records | ❌ Never transmitted |
| Settings | All settings except region code | ❌ Never transmitted |
| Fine timestamps | Anything narrower than 1 hour | ❌ Never transmitted |

## Data That MAY Leave the Device

| Data | Destination | Conditions |
|------|-------------|------------|
| Region code (ISO zone, e.g. `US-AZ-SRP`) | ElectricityMaps, EIA | Only for grid intensity lookup |
| Timestamp rounded to nearest hour | ElectricityMaps, EIA | Only for grid intensity lookup |
| API authentication token | ElectricityMaps, EIA | Required for API access |

## Enforcement

Privacy rules are enforced at two levels:

1. **`declarativeNetRequest` rules** — block all non-allowlisted destinations at the browser level before any request is sent. Cannot be bypassed by content scripts.

2. **Ethics Gate payload inspector** — inspects every outbound request payload for PII patterns before transmission. Logs and blocks any violation.

See `specs/ethics_gate.spec.md` for full enforcement details.

## What Is Stored Locally (IndexedDB)

Activity records store only:
- Activity type (video, AI prompt, etc.)
- Platform name (youtube, netflix, etc.)
- Duration in seconds
- Quality tier (480p, 720p, 1080p, 4K)
- Device type and connection type
- Computed gCO₂e value
- Grid intensity used and its source
- Autoplay flag (true/false)
- Timestamp rounded to nearest minute

Activity records explicitly **do not** store:
- URL or URL fragment
- Page title
- Tab ID
- Prompt text or character content
- IP address
- Any user identifier

## Onboarding Disclosure

Users are explicitly told during onboarding:
- What browser permissions are requested and why
- That browsing history never leaves the device
- The two allowlisted API domains (electricitymap.org, api.eia.gov)
- That no account creation is required

## Audit

The Ethics Gate maintains a local violations log. Any blocked request is surfaced as a non-dismissable banner in the popup. Violations are never reported externally.
