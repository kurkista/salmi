// @ts-check
// config.js — every editorial constant in salmi lives here, with its source.
// METHODOLOGY.md refers to this file by name; if you change a number here,
// update METHODOLOGY.md (and bump HPI.version if the number affects the index).

export const PORT = Number(process.env.PORT || 8080);
export const DB_PATH = process.env.DB_PATH || './dev.db';

// ---------------------------------------------------------------------------
// AIS ingest (AISStream.io, free tier, terrestrial receivers)
// ---------------------------------------------------------------------------
export const AIS = {
  url: 'wss://stream.aisstream.io/v0/stream',
  apiKey: process.env.AISSTREAM_API_KEY || '',
  // One box covering the Strait of Hormuz narrows, its Persian Gulf approach
  // and the Gulf of Oman approach incl. Fujairah anchorage.
  // AISStream format: [[lat1, lon1], [lat2, lon2]]
  boundingBox: [[24.5, 54.5], [27.5, 58.0]],
  messageTypes: ['PositionReport', 'ShipStaticData'],
  // Subscription must be sent within 3 s of the socket opening (AISStream rule).
  reconnectMinMs: 1_000,
  reconnectMaxMs: 60_000,
  // AISStream occasionally stalls silently; force a reconnect after this.
  stallMs: 3 * 60_000,
};

// ---------------------------------------------------------------------------
// Vessel store + transit detection at the narrows
// ---------------------------------------------------------------------------
export const VESSELS = {
  maxEntries: 6_000, // hard cap; Gulf bbox realistically holds 1–3k AIS targets
  staleMinutes: 40, // drop vessels not heard from in this long
  sweepMs: 5 * 60_000,
  broadcastThrottleMs: 5_000, // dirty-vessel deltas to browsers at most this often
  maxPlausibleSogKn: 40, // reject spoofed fixes faster than any merchant ship
};

export const GATE = {
  // Gate meridian across the narrows between Musandam (Oman) and Iran.
  // The IMO traffic separation scheme lanes pass roughly 26.3–26.7°N here.
  lon: 56.5,
  latMin: 25.9,
  latMax: 26.9,
  // A vessel is only assigned a side of the gate when >3 km from it
  // (hysteresis dead zone — kills GPS jitter / anchor-drift double counts).
  // 3 km of longitude at 26.4°N ≈ 3 / (111.32 × cos 26.4°) ≈ 0.0301°.
  hysteresisDegLon: 0.0301,
  minSogKn: 3, // slower fixes don't confirm a crossing (excludes drifters)
  maxCrossingHours: 6, // side flip older than this = reappearing ship, not a transit
  cooldownHours: 2, // per-vessel minimum between counted transits
  // AIS ship type codes 70–79 = cargo, 80–89 = tanker.
  shipTypeMin: 70,
  shipTypeMax: 89,
};

// ---------------------------------------------------------------------------
// Hormuz Passability Index — see METHODOLOGY.md for the full rationale
// ---------------------------------------------------------------------------
export const HPI = {
  version: 'hpi-v0',
  weights: { T: 0.45, N: 0.20, P: 0.20, O: 0.15 },
  // Pre-crisis baseline: IMF PortWatch daily transit calls ("n_total") for
  // chokepoint6 (Strait of Hormuz), average over 2025-01-01..2025-12-31 = 91.46.
  // Queried from the PortWatch ArcGIS API on 2026-07-09.
  baselineTransitsPerDay: 91.5,
  // T uses the PortWatch 7-day moving average (official, ~4-day publication
  // lag) — the same source Polymarket uses to resolve its Hormuz markets.
  // Band boundaries, highest first. A band change must clear the boundary by
  // `hysteresisPoints` or the previous band is kept (anti-flapping).
  bands: [
    { min: 80, name: 'OPEN' },
    { min: 55, name: 'RESTRICTED' },
    { min: 30, name: 'SEVERELY_DISRUPTED' },
    { min: 0, name: 'EFFECTIVELY_CLOSED' },
  ],
  hysteresisPoints: 2,
  // Brent 20-day realized volatility (annualized): σ ≤ 30% is normal (score
  // 100), σ ≥ 100% is max stress (score 0). 30% ≈ Brent's typical calm-year
  // realized vol; 100%+ seen only in extreme shocks (2020, 2022, this crisis).
  oilVol: { calm: 0.30, extreme: 1.00 },
  // News pressure: 24h GDELT article volume vs trailing 30-day median,
  // log10-scaled so 10× the median volume → score 0.
  newsLog10Span: 1,
  // A component older than its threshold is dropped and weights renormalize.
  stalenessMs: {
    T: 7 * 24 * 3600_000, // PortWatch publishes with ~4-day lag
    N: 3 * 3600_000,
    P: 1 * 3600_000,
    O: 48 * 3600_000,
  },
  recomputeMs: 5 * 60_000, // recompute cadence (cheap, reads latest from db)
  snapshotMs: 15 * 60_000, // persist at least this often (+ on band change)
};

// ---------------------------------------------------------------------------
// Pollers
// ---------------------------------------------------------------------------
export const POLYMARKET = {
  // direction 'normal': market asks "traffic returns to normal?" → P = p(yes)×100
  // direction 'closed': market asks "will it be closed?"        → P = (1−p(yes))×100
  // When a market resolves, the poller logs a loud warning; update the slug
  // here (see README "maintenance" section).
  markets: [
    { slug: 'strait-of-hormuz-traffic-returns-to-normal-by-july-31', direction: 'normal' },
  ],
  gammaUrl: 'https://gamma-api.polymarket.com',
  pollMs: 10 * 60_000,
};

export const GDELT = {
  docUrl: 'https://api.gdeltproject.org/api/v2/doc/doc',
  query: '"strait of hormuz"',
  // GDELT asks for ≥5 s between requests; we space consecutive calls by this.
  spacingMs: 6_000,
  pollMs: 60 * 60_000,
  headlineCount: 20,
  userAgent: 'salmi-monitor/0.1 (+https://github.com/kurkista/salmi)',
};

export const BRENT = {
  yahooSymbol: 'BZ=F',
  yahooUrl: 'https://query1.finance.yahoo.com/v8/finance/chart/',
  // FRED daily Brent spot (DCOILBRENTEU) — no key needed for the CSV export.
  // Publishes with a few days' lag; used as fallback + long history.
  fredCsvUrl: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) salmi-monitor/0.1',
  quotePollMs: 60 * 60_000,
  historyPollMs: 24 * 3600_000,
  volatilityWindowDays: 20,
};

export const PORTWATCH = {
  // IMF PortWatch daily chokepoint transit calls (official, ~4-day lag).
  // Hormuz = portid 'chokepoint6' (pageid cb5856…, the same page Polymarket
  // cites as its resolution source).
  queryUrl:
    'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query',
  portid: 'chokepoint6',
  fetchDays: 60,
  pollMs: 6 * 3600_000,
};

// ---------------------------------------------------------------------------
// Hilkka & Suomi layer (M2) — what the strait means in Finland
// ---------------------------------------------------------------------------
export const ELECTRICITY = {
  // Finnish spot electricity, c/kWh incl. VAT, 15-min resolution, free, no key.
  url: 'https://api.porssisahko.net/v2/latest-prices.json',
  pollMs: 3 * 3600_000,
};

export const STATFIN = {
  // Statistics Finland PxWeb API (free, no key).
  // 11xx = average prices of liquid fuels, monthly, €/L, 2002M01→
  // 122p = annual change of the Consumer Price Index, monthly.
  fuelUrl: 'https://statfin.stat.fi/PxWeb/api/v1/en/StatFin/khi/11xx.px',
  cpiUrl: 'https://statfin.stat.fi/PxWeb/api/v1/en/StatFin/khi/122p.px',
  fuelCodes: { pump_e95: '0700200', pump_diesel: '0700100', pump_heatoil: '0400500' },
  pollMs: 24 * 3600_000, // data changes monthly; a daily check is plenty
};

export const STOCKS = {
  // Hormuz-sensitive Helsinki tickers: Neste (refiner), Finnair (jet fuel +
  // Asian routes). Daily closes via the same Yahoo chart API as Brent.
  symbols: { stock_neste: 'NESTE.HE', stock_finnair: 'FIA1S.HE' },
  pollMs: 60 * 60_000,
};

export const FX = {
  // ECB reference rate USD per EUR (oil is priced in USD; a weak euro
  // amplifies pump prices in Finland).
  url: 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=120&format=csvdata',
  pollMs: 6 * 3600_000,
};

export const HILKKA = {
  // "Hilkka" is an average Finnish driver/household used to translate the
  // strait into everyday euros. Constants are deliberately ordinary:
  tankLiters: 50, // a typical full tank
  kmPerMonth: 1500, // average Finnish car does ~17–18k km/year
  litersPer100km: 7.0, // mixed driving, petrol car
  kwhPerMonth: 200, // apartment household without electric heating
  // Pre-crisis reference month: February 2026, the last calm month before
  // the March escalation (StatFin 11xx: diesel 1.80 €/L, E95 1.76 €/L).
  preCrisisMonth: '2026-02',
};

// ---------------------------------------------------------------------------
// Flight layer (M3) — OpenSky Network, free registered account
// ---------------------------------------------------------------------------
export const OPENSKY = {
  tokenUrl: 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
  statesUrl: 'https://opensky-network.org/api/states/all',
  clientId: process.env.OPENSKY_CLIENT_ID || '',
  clientSecret: process.env.OPENSKY_CLIENT_SECRET || '',
  // Wider Gulf region: Iranian airspace closures and Gulf reroutes are the story.
  bbox: { lamin: 23, lomin: 53, lamax: 28, lomax: 60 },
  // Registered accounts get 4000 credits/day; this bbox costs ~2/call, so a
  // 2-min cadence uses ~1440/day. On HTTP 429 we sit out a few runs.
  pollMs: 2 * 60_000,
  cooldownRuns: 5,
};

export const SSE = {
  pingMs: 25_000, // keeps fly's proxy from cutting idle connections
};

// Whitelist of series metrics exposed via /api/series/:metric
export const PUBLIC_METRICS = [
  'brent_usd',
  'brent_intraday',
  'brent_sigma20',
  'poly_p',
  'gdelt_vol24h',
  'gdelt_median30d',
  'gdelt_tone',
  'pw_total',
  'pw_tanker',
  'pw_cargo',
  'pw_7dma',
  'vessels_in_strait',
  'unique_large_24h',
  'hpi',
  'elec_spot',
  'pump_e95',
  'pump_diesel',
  'pump_heatoil',
  'stock_neste',
  'stock_finnair',
  'eurusd',
  'fi_cpi_yoy',
];
