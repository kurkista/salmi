# How salmi computes the Hormuz Passability Index

*Version: **hpi-v0** · last updated 2026-07-09*

salmi answers one question — **"is the Strait of Hormuz open?"** — with a
number from 0 to 100 and a plain-language band. Since June 2026 that question
has no official answer: the strait can be formally "reopened" while war-risk
insurance and convoy requirements keep most commercial traffic away. So we
compute an index, and we show every input, so you can disagree with it
precisely.

## The index

`HPI = 0.45·T + 0.20·N + 0.20·P + 0.15·O`

Each component is normalized to 0–100 where **100 = pre-crisis normal** and
**0 = fully closed/extreme stress**. All constants live in
[`server/config.js`](server/config.js) with source comments.

| | Component | Input | Normalization |
|---|---|---|---|
| **T** | Transit flow (45%) | [IMF PortWatch](https://portwatch.imf.org/pages/cb5856222a5b4105adc6ee7e880a1730) daily transit calls for the Strait of Hormuz (chokepoint6), 7-day moving average | `clamp(7dma / 91.5) × 100`. Baseline 91.5 = PortWatch 2025 full-year average, queried 2026-07-09. |
| **N** | News pressure (20%) | [GDELT](https://www.gdeltproject.org) 24 h article volume for `"strait of hormuz"` vs the **median daily volume of calendar 2025** (the last pre-crisis year; the median absorbs the June 2025 scare) | `100 × (1 − clamp(log₁₀(vol/calm)))` — 10× calm-year volume scores 0. A trailing median was rejected: it drifts up during a sustained crisis and reads as calm. |
| **P** | Market odds (20%) | [Polymarket](https://polymarket.com) "Strait of Hormuz traffic returns to normal by Jul 31" (resolves against PortWatch) | `p(normal) × 100`. For a "will it close" market the probability is inverted. |
| **O** | Oil stress (15%) | Brent 20-day realized volatility, annualized, from daily closes (Yahoo Finance, FRED fallback) | `100 × (1 − clamp((σ − 0.30) / 0.70))` — σ ≤ 30% is a calm market, σ ≥ 100% is 2020-grade panic. |

**Bands:** ≥ 80 **OPEN** · 55–79 **RESTRICTED** · 30–54 **SEVERELY DISRUPTED** ·
< 30 **EFFECTIVELY CLOSED**. A band change must clear the boundary by 2 points
(hysteresis), so the label doesn't flap on noise.

## Honesty mechanisms

- **Staleness handling.** Every component has a freshness threshold (T: 7 days
  — PortWatch publishes with ~4 days' lag; N: 3 h; P: 1 h; O: 48 h). A stale
  component is **dropped and the remaining weights are renormalized**; the UI
  marks it "stale — excluded". If nothing is fresh, there is no index — we
  never fabricate one.
- **Versioning.** Every snapshot stores the formula version (`hpi-v0`). Any
  change to weights, baselines or normalization bumps the version and gets a
  changelog entry below.
- **Component transparency.** The dashboard always shows the per-component
  scores and raw inputs (hover the breakdown list).

## Live ship layer and the transit gate

The map shows vessels from [AISStream.io](https://aisstream.io) (terrestrial
AIS, free tier) in the box 24.5–27.5°N / 54.5–58.0°E. We also count our own
**gate crossings** at the 56.5°E meridian across the narrows (25.9–26.9°N):

- only cargo/tanker AIS types (70–89) count;
- a vessel gets a confirmed side of the gate only when > 3 km from it
  (GPS-jitter hysteresis);
- a confirmed side flip counts as one transit **iff** the vessel was moving
  (≥ 3 kn), the flip happened within 6 h, and the vessel wasn't already
  counted in the last 2 h.

These live counts are **not** part of the index yet (v0 uses PortWatch, the
official series): terrestrial AIS coverage of the Iranian coast is patchy, so
our counts undercount. We log both and will calibrate a coverage factor
against PortWatch before our own counts earn index weight (that will be
hpi-v1).

## Known biases and what this is not

- **Dark fleet excluded.** Sanctioned tankers that disable AIS or spoof
  positions are invisible here. The index measures *visible commercial
  traffic*, which is exactly what "is it open for normal shipping" means — but
  it is not total oil flow.
- **Polymarket markets rotate.** Date-bounded markets mechanically drift as
  the deadline nears and get replaced when they resolve; the config pins the
  slug and the changelog records switches.
- **News volume is attention, not truth.** N measures how loudly the world is
  talking about Hormuz, which is a real economic signal (it moves insurance
  and hedging) but not a physical measurement.
- **Not navigation advice. Not trading advice.** salmi is a civic-information
  project built on free public data. Vessel positions can be hours stale;
  never use this for anything operational.

## Data sources

| Source | What | Cost/terms |
|---|---|---|
| AISStream.io | live AIS, Hormuz bbox | free tier, non-commercial |
| IMF PortWatch | official daily transit calls (chokepoint6) | open data |
| Polymarket Gamma API | prediction-market odds | public, read-only |
| GDELT DOC 2.0 | news volume/tone/headlines | free, ≥5 s between calls |
| Yahoo Finance / FRED | Brent price + volatility | unofficial / open |
| CARTO + OpenStreetMap | dark basemap tiles | free with attribution |

## Changelog

- **hpi-v0** (2026-07-09) — first release. T = PortWatch 7dma / 91.5 (2025
  average); N = GDELT log-ratio; P = Polymarket "normal by Jul 31"; O = Brent
  20-day realized vol between 30% and 100%.
