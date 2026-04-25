# Spec: Scheduler Nudge

## Trigger Conditions

Surface a nudge when the user:
- Opens a long-form video (> 20 minutes)
- Initiates a large download
- Starts a video call

## Action

1. Compute current-hour grid intensity via `grid_intensity_lookup.spec.md`
2. Compute grid intensity at each of the next 24 hours for the user's region
3. Find the hour with the lowest projected intensity
4. Compute `shift_savings_pct = (current_intensity - best_intensity) / current_intensity × 100`
5. If `shift_savings_pct > 30%` AND grid confidence is `"medium"` or `"high"`, surface the nudge

## Nudge Message Format

```
"This [duration]-min session = [current_g]g now.
 Shift to [best_hour] = [best_g]g (-[savings_pct]%)."
```

Example:
> "This 90-min session = 82g now. Shift to 2 PM = 36g (-56%)."

## Nudge UI

- Non-blocking overlay — does NOT prevent video playback or any user action
- **"Remind me"** button — sets a browser notification (`chrome.notifications`) for the suggested time
- **"Dismiss"** button — closes the nudge and starts the per-activity-type mute timer

## Mute / Cooldown

- After dismissal, no further nudge is surfaced for that activity type for **2 hours**
- Cooldown stored in settings: `nudgeCooldowns: { [activityType]: dismissedAt }`
- Cooldown is per-activity-type (dismissing a video nudge does not mute AI prompt nudges)

## Correctness Properties

- Nudge fires **if and only if**: a future hour reduces carbon cost by ≥ 30% AND confidence is `"medium"` or `"high"`
- After dismissal, no nudge for the same activity type within 2 hours
- Nudge never blocks playback or any other user action

## Dependencies

- `grid_intensity_lookup.spec.md` — hourly forecast data
- `carbon_calculator.spec.md` — carbon cost computation per hour
