---
inclusion: always
---

# Comparison Anchors

How WattWise translates abstract gCO₂e values into relatable real-world equivalents.

## Anchor Constants

| Anchor | gCO₂e equivalent | Source / Notes |
|--------|-------------------|----------------|
| Google search | 0.2 g | Google Environmental Report 2022 |
| Mile not driven | 404 g | US EPA — average passenger vehicle |
| Phone charge (full) | 8.22 g | Based on 12 Wh battery at 475 gCO₂e/kWh |
| Kettle boiled | 50 g | Based on 0.1 kWh at 475 gCO₂e/kWh (UK avg) |

## Selection Logic

When displaying anchors in the popup, select the **two most relatable** values — meaning the anchors that produce numbers in a human-friendly range (not fractional, not astronomical):

```
score(anchor) = abs(log10(gCO2e / anchorConstant))
// Lower score = closer to 1.0 = most relatable
// Pick the two anchors with the lowest score
```

Example: 30-day total of 5,000 gCO₂e
- Google searches: 25,000 → too large
- Miles not driven: 12.4 → good ✓
- Phone charges: 608 → good ✓
- Kettles boiled: 100 → good ✓
→ Display "miles not driven" and "phone charges" (closest to human scale)

## Usage in Code

```typescript
import { toComparisonAnchors } from './carbon-calculator'

const anchors = toComparisonAnchors(gCO2e)
// Returns: { googleSearches, milesNotDriven, phoneCharges, kettlesBoiled }
```

## Display Format

- Always round to 1 decimal place for display
- Use plain language: "12.4 miles not driven", "608 phone charges"
- For the savings counter: "You've saved X kg CO₂ — that's Y miles not driven"

## Correctness Rules

- All anchor values must be ≥ 0 and finite for any non-negative gCO₂e input
- Never display negative anchor values
- If gCO₂e = 0, display "0 g CO₂" rather than anchor equivalents
