---
inclusion: always
---

# Grid Fallback Table

Static hourly carbon intensity curves for the top 20 US grid zones. Used when both ElectricityMaps and EIA APIs are unavailable. Values are representative averages based on historical data — confidence level is `low`.

All values in **gCO₂e/kWh**.

## How to Use

Look up the user's `regionCode`, then index into the `hourly` array by hour-of-day (0 = midnight local time, 23 = 11 PM local time).

## Zone Data

```json
{
  "US-CAL-CISO": {
    "name": "California ISO",
    "hourly": [220,215,210,208,205,210,225,240,235,220,210,205,200,198,200,210,230,260,280,275,260,245,235,225]
  },
  "US-TEX-ERCO": {
    "name": "ERCOT (Texas)",
    "hourly": [380,370,360,355,350,355,370,390,400,410,415,420,425,430,435,440,445,450,445,430,415,405,395,385]
  },
  "US-MIDA-PJM": {
    "name": "PJM Interconnection",
    "hourly": [410,400,395,390,385,390,405,425,440,450,455,460,465,468,470,472,475,478,475,465,455,440,430,420]
  },
  "US-NE-ISNE": {
    "name": "ISO New England",
    "hourly": [290,280,275,270,268,272,285,300,315,325,330,335,338,340,342,345,348,350,345,335,320,310,300,295]
  },
  "US-NY-NYIS": {
    "name": "New York ISO",
    "hourly": [270,260,255,250,248,252,265,280,295,305,310,315,318,320,322,325,328,330,325,315,305,295,285,275]
  },
  "US-MIDW-MISO": {
    "name": "MISO (Midwest)",
    "hourly": [490,480,472,468,465,468,480,500,515,525,530,535,538,540,542,545,548,550,545,535,520,510,500,495]
  },
  "US-SW-AZPS": {
    "name": "Arizona Public Service",
    "hourly": [420,410,405,400,398,402,415,435,450,460,465,468,465,460,455,450,445,440,435,425,415,410,405,415]
  },
  "US-NW-BPAT": {
    "name": "Bonneville Power (Pacific NW)",
    "hourly": [80,78,76,75,74,75,80,90,100,108,112,115,118,120,122,125,128,130,125,115,105,95,88,82]
  },
  "US-SE-SOCO": {
    "name": "Southern Company (SE)",
    "hourly": [430,420,415,410,408,412,425,445,460,470,475,478,480,482,484,486,488,490,485,475,462,450,440,435]
  },
  "US-FLA-FPL": {
    "name": "Florida Power & Light",
    "hourly": [395,385,378,374,372,375,388,408,422,432,438,442,445,448,450,452,455,458,452,442,430,418,408,400]
  },
  "US-CENT-SPA": {
    "name": "Southwest Power Pool (Central)",
    "hourly": [510,500,492,488,485,488,500,520,535,545,550,555,558,560,562,565,568,570,565,555,540,530,520,515]
  },
  "US-NW-PACW": {
    "name": "PacifiCorp West",
    "hourly": [350,340,335,330,328,332,345,365,380,390,395,398,400,402,404,406,408,410,405,395,382,370,360,355]
  },
  "US-MIDW-LGEE": {
    "name": "LG&E and KU (Kentucky)",
    "hourly": [560,548,540,535,532,535,548,568,582,592,598,602,605,608,610,612,615,618,612,602,588,575,565,560]
  },
  "US-TEN-TVA": {
    "name": "Tennessee Valley Authority",
    "hourly": [380,370,362,358,355,358,372,392,408,418,424,428,430,432,434,436,438,440,435,425,412,400,390,382]
  },
  "US-CAR-CPLE": {
    "name": "Duke Energy Carolinas",
    "hourly": [400,390,382,378,375,378,392,412,428,438,444,448,450,452,454,456,458,460,455,445,432,420,410,402]
  },
  "US-NW-NEVP": {
    "name": "NV Energy (Nevada)",
    "hourly": [360,350,344,340,338,342,355,375,390,400,405,408,410,412,414,416,418,420,415,405,392,380,370,362]
  },
  "US-SW-WALC": {
    "name": "Western Area Lower Colorado",
    "hourly": [310,300,294,290,288,292,305,325,340,350,355,358,360,362,364,366,368,370,365,355,342,330,320,312]
  },
  "US-MIDW-EEI": {
    "name": "Ameren (Illinois/Missouri)",
    "hourly": [480,470,462,458,455,458,470,490,505,515,520,524,526,528,530,532,534,536,530,520,506,494,484,478]
  },
  "US-SE-AEC": {
    "name": "PowerSouth Energy (Alabama)",
    "hourly": [445,435,428,424,422,425,438,458,472,482,488,492,494,496,498,500,502,504,498,488,475,462,452,446]
  },
  "US-NE-PSCO": {
    "name": "Public Service Colorado",
    "hourly": [440,430,422,418,415,418,430,450,465,475,480,484,486,488,490,492,494,496,490,480,466,454,444,440]
  }
}
```

## Notes

- Values are hourly averages — actual intensity varies by season and weather
- Pacific NW (BPAT) is consistently low due to hydroelectric dominance
- Texas (ERCO) and Midwest (MISO) tend to be higher due to coal/gas mix
- California (CISO) shows a pronounced midday dip from solar generation
- When the user's zone is not in this table, use the global average of 475 gCO₂e/kWh
