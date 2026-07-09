# salmi

**Is the Strait of Hormuz open?** A live, transparent passability monitor.

*Salmi* is Finnish for "strait". Since June 2026 the answer to the question
above is genuinely contested — the strait can be formally "reopened" while
insurance costs and convoy rules keep most shipping away. salmi watches the
strait from four angles at once and condenses them into one honest number,
the **Hormuz Passability Index (HPI)**:

- 🚢 **Ships** — live AIS vessel map + our own transit-gate counter at the
  narrows, and IMF PortWatch's official daily transit calls
- 📈 **Markets** — Brent price & volatility, Polymarket crowd odds
- 🗞️ **Politics** — GDELT news pressure, tone, and hand-curated event
  annotations on the price chart
- 🇫🇮 **Finland** — what it means for fuel pumps, electricity and daily life
  ("Hilkka & Suomi" layer)

Every component of the index is visible, versioned and explained —
see **[METHODOLOGY.md](METHODOLOGY.md)** (also rendered inside the app).

`[IMAGE: dashboard screenshot — dark map of the strait with live vessels,
HPI gauge on the left, Brent chart with event annotations on the right]`

## Architecture

One small Node app (Fly.io, 256 MB) that:

1. holds a live [AISStream.io](https://aisstream.io) websocket for the Hormuz
   bounding box → in-memory vessel store → SSE deltas to browsers,
2. polls free public APIs (IMF PortWatch, Polymarket Gamma, GDELT, Yahoo
   Finance/FRED, pörssisähkö, EU Oil Bulletin) on gentle cadences,
3. persists time series in SQLite (`node:sqlite`, no native deps),
4. computes the HPI and serves a static Vite/MapLibre/ECharts frontend.

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

- **Polymarket markets resolve and rotate.** When the poller logs a
  `market RESOLVED` warning, pick the successor market on polymarket.com and
  update `POLYMARKET.markets` in [server/config.js](server/config.js) (slug +
  direction), and note it in METHODOLOGY.md's changelog.
- **Sunset plan:** a daily GitHub Action exports aggregates to
  [data/export/](data/export/). If the Fly app is ever retired, the dashboard
  can be rebuilt as a static page on top of those exports — the data outlives
  the server.

## License

MIT — see [LICENSE](LICENSE). Data sources have their own terms; see
[METHODOLOGY.md](METHODOLOGY.md#data-sources).
