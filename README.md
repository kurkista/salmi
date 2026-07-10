# tutka

**A civic/OSINT threat-monitoring platform for Finland.** *Tutka* is Finnish
for "radar". It grew out of `salmi`, a single-purpose Strait of Hormuz
passability monitor — that groundwork became the reusable engine
(weighted-scoring index, GDELT poller pattern, live AIS/flight tracking) now
pointed at what the platform is actually for: Finland/Russia and
Nordic/Baltic tension. The project (repo and live app) has since been renamed
`tutka` to match.

## The six domains

Domain 1 was originally built as a Hormuz-only monitor, then rebuilt to
track Nordic/Baltic-Russia tension instead — Hormuz's own working code and
data stay in the repo (dormant, not deleted; see below), but no longer
drive the live app. Domain 3 (Information environment) is the second real
domain, proving the platform can hold more than one before investing in
domains that need brand-new data sourcing. See **[ROADMAP.md](ROADMAP.md)**
for what's scouted-but-not-built.

| # | Domain | What it tracks | Status |
|---|---|---|---|
| 1 | State & military tension | Chokepoints, troop movements, official statements — Nordic/Baltic-Russia tension is the live instance | **Built** |
| 2 | Hybrid & grey-zone threats | GPS jamming, undersea cable/pipeline sabotage, drone incursions, border incidents | Scouted (ROADMAP.md) |
| 3 | Information environment | Disinformation / influence-operation narrative pressure | **Built** |
| 4 | Civic & critical infrastructure | Cyberattacks, energy/water/telecom disruptions | Scouted (ROADMAP.md) |
| 5 | Social stability | Polarization, public trust, unrest | Scouted (ROADMAP.md) |
| 6 | Environmental & climate security | — | Scouted (ROADMAP.md), may fold into #4 |

Every domain's index is versioned and fully explained in
**[METHODOLOGY.md](METHODOLOGY.md)** (also rendered inside the app).

## Domain 1 — State & military tension (Nordic/Baltic)

Tracks Finland/Baltic-NATO-Russia military and security tension: how loudly
world media is talking about troop movements, airspace violations, and
border incidents right now, vs. a calm-2025 baseline — the **Nordic Tension
Index**. Live AIS ships and OpenSky flights over the Gulf of Finland/Baltic
are shown as this domain's live layers (not scored — no honest signal exists
yet from raw vessel/flight counts the way Hormuz's transit-count drop was).

### On the dormant Hormuz module

The Strait of Hormuz passability monitor (`server/hpi.js`, the Brent/
Polymarket/PortWatch pollers) is the project's original build and stays in
the repo fully intact — kept, not deleted, per the project's "don't throw
away working code" approach. It is simply no longer scheduled: no live
polling, no UI. Its historical data remains queryable (`/api/export`,
`/api/series/hpi` etc.) and its methodology section stays in
METHODOLOGY.md for reference.

## Domain 3 — Information environment

Tracks disinformation/influence-operation narrative pressure around
Finland/Baltic keywords via GDELT (news volume + tone) — the same mechanism
as domain 1, a separate query, separate series, its own two-component index.
See METHODOLOGY.md for the full formula and why EUvsDisinfo (the obvious
EU-official secondary source) isn't integrated yet.

## Architecture

One small Node app (Fly.io, 256 MB) that:

1. holds a live [AISStream.io](https://aisstream.io) websocket for the Gulf
   of Finland/Baltic bounding box → in-memory vessel store → SSE deltas to
   browsers,
2. polls free public APIs (GDELT for both domains 1 and 3, pörssisähkö,
   Statistics Finland, ECB) on gentle cadences,
3. persists time series in SQLite (`node:sqlite`, no native deps), with a
   generic `index_snapshots` table so each domain's index doesn't need its
   own bespoke schema,
4. computes each domain's index via a shared weighted-scoring engine
   (`server/indices/engine.js`) and serves a Vite/MapLibre/ECharts frontend:
   a dashboard home (synthesis panel + six domain cards) with a per-domain
   deep-dive view behind client-side hash routing (`#domain/N`).

No accounts, no tracking, no paid data. Total hosting cost ≈ $2/month.

## Run it

```bash
cp .env.example .env   # add your free AISStream key (optional but nice)
npm install
npm run build          # frontend → dist/
npm start              # server on :8080, serves dist/
```

Dev loop: `npm run dev:server` + `npm run dev:web` (Vite on :5173 proxies to :8080).
Tests: `npm test`.

## Deploy (Fly.io)

```bash
fly launch --no-deploy   # once; fly.toml is already configured
fly secrets set AISSTREAM_API_KEY=xxxx
fly deploy
```

## Maintenance notes

- **GDELT news relay** (`.github/workflows/news-relay.yml`) is a matrix job
  over both live domains — each fetches its own query and posts to
  `/api/ingest/gdelt/:module`. Adding a future domain's own GDELT query means
  adding one more matrix entry, not a new workflow.
- **AIS/OpenSky bounding boxes** (`server/config.js`'s `AIS.boundingBox`/
  `OPENSKY.bbox`) are the only place the monitored geography lives — the
  ingest spoof-filter and zone-count logic in `server/vessels.js` both derive
  from `AIS.boundingBox` rather than hardcoding their own box, specifically
  so a future re-point doesn't silently break (this bit us once already).
- **Sunset plan:** a daily GitHub Action exports aggregates to
  [data/export/](data/export/). If the Fly app is ever retired, the dashboard
  can be rebuilt as a static page on top of those exports — the data outlives
  the server.

## License

MIT — see [LICENSE](LICENSE). Data sources have their own terms; see
[METHODOLOGY.md](METHODOLOGY.md#data-sources).
