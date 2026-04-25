# Spec: Ethics Gate

All outbound network calls from the extension MUST pass through the Ethics Gate before being sent.

## Enforcement Layers

### Layer 1 — `declarativeNetRequest` (hard block)
- Blocks all requests whose destination is NOT in the allowlist
- Evaluated by the browser before the request is sent
- Cannot be bypassed by content scripts

### Layer 2 — `chrome.webRequest.onBeforeRequest` observer (audit + PII detection)
- Inspects payload of every allowlisted request
- Logs violations to local `violations.log` (IndexedDB)
- Surfaces non-dismissable banner in popup on violation

## Rules

### 1. Destination Allowlist
Only these two domains are permitted:
- `api.electricitymap.org`
- `api.eia.gov`

All other destinations are blocked unconditionally.

### 2. Payload Inspector
Reject the request if the payload contains any of:
- A URL or URL fragment
- A hostname
- A page title
- A tab ID
- A user identifier
- A timestamp narrower than one hour
- GPS coordinates
- An IP address
- Any PII pattern (email address, phone number)

### 3. Region-Only Geography
- Accept: country codes, state codes, ISO grid zone identifiers (e.g. `US-AZ-SRP`)
- Reject: precise coordinates, city names, postal codes, street addresses

### 4. User Data — Never Permitted
The following data categories must NEVER leave the device under any circumstances:
- Activity log
- Browsing history
- Page URLs or titles
- Prompt text
- Settings (other than region code)
- Tab IDs or window IDs

## Permitted Payload Fields
Allowlisted requests may contain ONLY:
- `regionCode` — ISO zone identifier
- `timestamp` — rounded to the nearest hour
- API authentication token

## Violation Handling

1. Block the request immediately
2. Write a `ViolationRecord` to local IndexedDB:
   ```typescript
   {
     timestamp: number
     blockedDestination: string
     ruleViolated: string
     acknowledged: boolean  // false until user acknowledges in settings
   }
   ```
3. Surface a **non-dismissable** banner in the popup:
   > "A network request was blocked by the Ethics Gate: `<rule_violated>`"
4. Banner persists until the user acknowledges it in the Settings panel
5. Violation is never reported to any external service

## Correctness Properties

- Every non-allowlisted destination is blocked regardless of method, path, or payload
- Every allowlisted payload contains only `regionCode`, rounded timestamp, and API token
- No `ActivityRecord` written to IndexedDB contains URL, page title, tab ID, prompt text, or IP address
