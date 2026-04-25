# Spec: Autoplay Auditor

## Purpose

Track video content that plays without explicit user action and attribute its carbon cost to a separate "content you didn't choose" bucket — making the hidden cost of autoplay features visible.

## Detection

### YouTube
- Check `data-autoplay` attribute on the `<video>` element
- Check for the "Up Next" countdown overlay in the DOM
- Tag activity event with `autoplay: true` when either signal is present

### Netflix
- Check for the post-play countdown overlay (the "Next Episode in X seconds" UI)
- Tag activity event with `autoplay: true` when the overlay is detected

## Attribution

- Autoplay activities are tagged `autoplay: true` in the `ActivityRecord`
- The Activity Aggregator routes them to `videoAutoplayGCO2e` in rolling aggregates
- They are **never** counted in `videoUserGCO2e`

## Dashboard Display

- Autoplay carbon appears as a **distinct line item** in the popup Activity Breakdown panel
- Label: "Video (autoplay — content you didn't choose)"
- Shown separately from user-initiated video streaming

## Floating Badge Indicator

- When `autoplayCarbonG` exceeds **10 gCO₂e** in the current session, the Floating Badge displays a one-time indicator:
  > "X g from autoplay this session"
- Shown at most **once per tab session** (not persisted)

## Correctness Properties

- Every `ActivityRecord` with `autoplay: true` contributes to `videoAutoplayGCO2e` only
- Every `ActivityRecord` with `autoplay: false` contributes to `videoUserGCO2e` only
- The autoplay indicator appears exactly once per session when the 10 gCO₂e threshold is crossed
