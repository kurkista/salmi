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
  // Gulf of Finland + northern Baltic: the Helsinki-Tallinn corridor, the
  // St. Petersburg/Primorsk/Ust-Luga shadow-fleet tanker route past Gogland,
  // and the Åland Sea approach — the highest-traffic, highest-tension slice,
  // not the whole Baltic. Widen toward Gotland/Bornholm later if domain 2
  // (hybrid/grey-zone, cable sabotage) wants the same feed.
  // AISStream format: [[lat1, lon1], [lat2, lon2]]
  boundingBox: [[58.5, 21.0], [60.7, 30.5]],
  messageTypes: ['PositionReport', 'ShipStaticData'],
  // Subscription must be sent within 3 s of the socket opening (AISStream rule).
  reconnectMinMs: 1_000,
  reconnectMaxMs: 60_000,
  // AISStream occasionally stalls silently; force a reconnect after this.
  stallMs: 3 * 60_000,
};

// ---------------------------------------------------------------------------
// Vessel store + transit detection
// ---------------------------------------------------------------------------
export const VESSELS = {
  // Watch this after a few days of real Baltic traffic: the Gulf of Finland
  // is one of the busiest AIS corridors in the world (40+ daily Helsinki-
  // Tallinn ferry crossings alone, plus dense cargo/tanker traffic) — likely
  // denser than the old Hormuz box even at a similar bbox area.
  maxEntries: 6_000, // hard cap; revisit if the Baltic box saturates this
  staleMinutes: 40, // drop vessels not heard from in this long
  sweepMs: 5 * 60_000,
  broadcastThrottleMs: 5_000, // dirty-vessel deltas to browsers at most this often
  maxPlausibleSogKn: 40, // reject spoofed fixes faster than any merchant ship
};

export const GATE = {
  // No single narrow chokepoint meridian exists in the open Baltic the way
  // Hormuz's narrows has one — disabled for the Nordic repoint rather than
  // forcing fake geometry onto the Gulf of Finland. Kept (not deleted) for a
  // real future chokepoint, e.g. the Danish straits.
  enabled: false,
  // Gate meridian across the narrows between Musandam (Oman) and Iran.
  // The IMO traffic separation scheme lanes pass roughly 26.3–26.7°N here.
  // Hormuz-specific values below are irrelevant while enabled=false.
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
  // AIS ship type codes 70–79 = cargo, 80–89 = tanker. Reused by
  // vessels.js's _isLarge()/_isTanker() regardless of `enabled` — these are
  // ship-type classification thresholds, not gate geometry.
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
// Information Environment Index — domain 3 (disinformation/narrative
// pressure around Finland/Baltic keywords). Second domain built after Hormuz;
// see hpi.js/indices/infoenv.js and METHODOLOGY.md for the full rationale.
// Deliberately just two honest signals, not forced into HPI's four-part shape.
// ---------------------------------------------------------------------------
export const INFOENV = {
  version: 'infoenv-v0',
  weights: { V: 0.6, T: 0.4 },
  // Same direction convention as HPI: higher score = calmer. Band names are
  // domain-appropriate, not reused from HPI's OPEN/RESTRICTED/... names.
  bands: [
    { min: 70, name: 'CALM' },
    { min: 45, name: 'ELEVATED' },
    { min: 20, name: 'ACTIVE' },
    { min: 0, name: 'SATURATED' },
  ],
  hysteresisPoints: 2,
  // News volume: 24h GDELT article volume vs a calm-2025 median baseline,
  // log10-scaled exactly like HPI's N component (10× the median → score 0).
  newsLog10Span: 1,
  // GDELT average tone is roughly 0 (neutral) down to about -10 (extreme
  // negative coverage) in ordinary use; -8 is a genuinely alarmed 24h average.
  toneCalm: 0,
  toneExtreme: -8,
  stalenessMs: {
    V: 3 * 3600_000,
    T: 24 * 3600_000,
  },
  recomputeMs: 5 * 60_000,
  snapshotMs: 15 * 60_000,
};

// ---------------------------------------------------------------------------
// Nordic tension Index — domain 1's real content (State & military tension),
// rebuilt for Finland/Baltic after retiring Hormuz as the flagship domain.
// Same two-honest-signal shape as INFOENV: no clean daily official series
// exists for Nordic military tension the way PortWatch did for Hormuz, so
// GDELT news pressure is the real anchor here, same as it is for domain 3.
// See indices/nordic.js and METHODOLOGY.md.
// ---------------------------------------------------------------------------
export const NORDIC = {
  version: 'nordic-v0',
  weights: { V: 0.6, T: 0.4 },
  // Higher score = calmer, same convention as HPI/INFOENV. Band names are
  // domain-appropriate, not reused from either other domain's vocabulary.
  bands: [
    { min: 70, name: 'CALM' },
    { min: 45, name: 'ELEVATED' },
    { min: 20, name: 'HEIGHTENED' },
    { min: 0, name: 'CRITICAL' },
  ],
  hysteresisPoints: 2,
  newsLog10Span: 1,
  toneCalm: 0,
  toneExtreme: -8,
  stalenessMs: {
    V: 3 * 3600_000,
    T: 24 * 3600_000,
  },
  recomputeMs: 5 * 60_000,
  snapshotMs: 15 * 60_000,
};

// ---------------------------------------------------------------------------
// Civic & critical infrastructure Index — domain 4 (cyberattacks, energy/
// grid/water/telecom disruptions). Same GDELT V/T shape as NORDIC/INFOENV,
// same "no clean daily official series" reasoning. Distinct from those two
// in one way: it also gets a second, genuinely independent source — NCSC-FI's
// public warnings RSS feed (see NCSCFI below and pollers/ncscfi.js) — logged
// as headlines (module 'infra_advisory'), not yet scored into the index
// itself. Verified 2026-07-24: NCSC-FI's feed is live, structured RSS, no
// auth/bot-wall. ENISA was considered but not confirmed to have a continuous
// feed (looked like annual-report-only) — not integrated pending a real check.
// See indices/infra.js and METHODOLOGY.md.
// ---------------------------------------------------------------------------
export const INFRA = {
  version: 'infra-v0',
  weights: { V: 0.6, T: 0.4 },
  bands: [
    { min: 70, name: 'CALM' },
    { min: 45, name: 'ELEVATED' },
    { min: 20, name: 'STRAINED' },
    { min: 0, name: 'CRITICAL' },
  ],
  hysteresisPoints: 2,
  newsLog10Span: 1,
  toneCalm: 0,
  toneExtreme: -8,
  stalenessMs: {
    V: 3 * 3600_000,
    T: 24 * 3600_000,
  },
  recomputeMs: 5 * 60_000,
  snapshotMs: 15 * 60_000,
};

// ---------------------------------------------------------------------------
// NCSC-FI (Kyberturvallisuuskeskus) public warnings RSS — domain 4's second,
// independent (non-GDELT) source. Confirmed live 2026-07-24:
// https://www.kyberturvallisuuskeskus.fi/feed/rss/fi/401 returns HTTP 200,
// well-formed RSS 2.0, real recent items. Logged as headlines, not scored —
// same "shown, not scored" treatment as domain 1's AIS/OpenSky layer, until
// there's an honest way to turn advisory counts into a signal.
// ---------------------------------------------------------------------------
export const NCSCFI = {
  feedUrl: 'https://www.kyberturvallisuuskeskus.fi/feed/rss/fi/401',
  module: 'infra_advisory',
  userAgent: 'tutka-monitor/0.1 (+https://github.com/kurkista/tutka)',
  pollMs: 60 * 60_000,
};

// ---------------------------------------------------------------------------
// ENISA EUVD (European Union Vulnerability Database) — a real JSON REST API,
// NOT enisa.europa.eu's general news RSS (that turned out to be irregular
// press content, not threat intel — checked and rejected 2026-07-24). EUVD
// launched under NIS2 in 2025; confirmed live 2026-07-24, returns fresh
// CVE-style records with CVSS/vendor data. No key required. Logged as
// headlines like NCSC-FI, not scored — same reasoning as NCSCFI above.
// ---------------------------------------------------------------------------
export const EUVD = {
  apiUrl: 'https://euvdservices.enisa.europa.eu/api/lastvulnerabilities',
  module: 'infra_advisory',
  userAgent: 'tutka-monitor/0.1 (+https://github.com/kurkista/tutka)',
  pollMs: 60 * 60_000,
};

// ---------------------------------------------------------------------------
// CERT-EU security-advisories RSS — EU-institutional advisory feed, confirmed
// live 2026-07-24 (real cadence, ~monthly with clustering, most recent item
// same-week at verification time). Optional third infra_advisory source;
// same "logged, not scored" treatment.
// ---------------------------------------------------------------------------
export const CERTEU = {
  feedUrl: 'https://cert.europa.eu/publications/security-advisories-rss',
  module: 'infra_advisory',
  userAgent: 'tutka-monitor/0.1 (+https://github.com/kurkista/tutka)',
  pollMs: 6 * 3600_000,
};

// ---------------------------------------------------------------------------
// Fingrid Open Data — the transmission system operator's "power system
// state" dataset: a traffic-light indicator (1 green .. 5 blue, see
// dataset docs) that IS Fingrid's own incident/anomaly assessment, not a
// raw series needing custom anomaly detection. Confirmed live 2026-07-24 via
// the developer portal (developer-data.fingrid.fi) and a direct curl against
// data.fingrid.fi/api/datasets/209/data/latest, which returned a real
// current value ({"datasetId":209,...,"value":1}) — dataset 209 = "Power
// system state - real-time data" (1 green .. 5 blue), confirmed by id in the
// dataset's own example-data panel. Also added dataset 336 = "Electricity
// shortage status" (0 normal .. 3 shortage), same traffic-light shape,
// found alongside 209 in the same search. Auth is a subscription key in the
// `x-api-key` header (confirmed via the portal's "Try it" panel); the owner
// already has a provisioned key ("sauna-study" subscription) which is set
// locally in .env per CLAUDE.md's secrets rule — still needs `fly secrets
// set FINGRID_API_KEY` to go live on the deployed app.
// ---------------------------------------------------------------------------
export const FINGRID = {
  apiBase: 'https://data.fingrid.fi/api/datasets',
  apiKey: process.env.FINGRID_API_KEY || '',
  datasets: {
    powerSystemState: 209, // 1 green, 2 yellow, 3 red, 4 black, 5 blue
    electricityShortageStatus: 336, // 0 normal, 1 possible, 2 high risk, 3 shortage
  },
  pollMs: 5 * 60_000,
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
  // GDELT asks for ≥5 s between requests; we space consecutive calls by this.
  // 30-min cadence + in-query retries: fly's shared IPv4 egress NAT means
  // GDELT's per-IP quota is contested, so most requests 429 — we need chances.
  spacingMs: 10_000,
  headlineCount: 20,
  userAgent: 'tutka-monitor/0.1 (+https://github.com/kurkista/tutka)',
  // One config block per monitored domain — same GDELT mechanism, different
  // query/series names/calm baseline. Add a new block here for a future domain
  // rather than duplicating pollers/gdelt.js.
  modules: {
    // Dormant (not scheduled — see index.js) since Hormuz was retired as the
    // flagship domain. Kept, not deleted, per "not delete, stop investing".
    hormuz: {
      module: 'hormuz',
      query: '"strait of hormuz"',
      seriesPrefix: 'gdelt_',
      pollMs: 30 * 60_000,
      // Calm-period window for the N baseline: calendar year 2025, the last
      // pre-crisis year (the June 2025 scare is absorbed by using the median).
      calmStart: '20250101000000',
      calmEnd: '20251231235959',
    },
    // Domain 1's real query going forward: Finland/Baltic/NATO military and
    // security tension with Russia — distinct from infoenv's disinformation
    // query below. This wording is the single highest-leverage editorial
    // call in the Nordic repoint; retune the keyword list once real volume
    // is visible.
    nordic: {
      module: 'nordic',
      query: '(Finland OR Baltic OR NATO) AND Russia AND (military OR troops OR incursion OR "air policing" OR "airspace violation" OR "border incident")',
      seriesPrefix: 'gdelt_nordic_',
      pollMs: 30 * 60_000,
      calmStart: '20250101000000',
      calmEnd: '20251231235959',
    },
    infoenv: {
      module: 'infoenv',
      query: '(Finland OR Estonia OR Latvia OR Lithuania OR Baltic) AND (disinformation OR propaganda OR "influence operation" OR "information operation")',
      seriesPrefix: 'gdelt_infoenv_',
      pollMs: 30 * 60_000,
      calmStart: '20250101000000',
      calmEnd: '20251231235959',
    },
    // Domain 4's GDELT half — see INFRA/NCSCFI/EUVD/CERTEU/FINGRID above for
    // the rest of the domain. Query is a draft: geographic prefix anchors it
    // to Finland/Baltic so "power outage"/"blackout" don't pull in unrelated
    // global storm coverage; retune once real volume is visible, same caveat
    // as nordic's query above.
    infra: {
      module: 'infra',
      query: '(Finland OR Estonia OR Latvia OR Lithuania OR Baltic) AND (cyberattack OR "cyber attack" OR ransomware OR "power outage" OR blackout OR "grid failure" OR "critical infrastructure")',
      seriesPrefix: 'gdelt_infra_',
      pollMs: 30 * 60_000,
      calmStart: '20250101000000',
      calmEnd: '20251231235959',
    },
  },
};

export const BRENT = {
  yahooSymbol: 'BZ=F',
  yahooUrl: 'https://query1.finance.yahoo.com/v8/finance/chart/',
  // FRED daily Brent spot (DCOILBRENTEU) — no key needed for the CSV export.
  // Publishes with a few days' lag; used as fallback + long history.
  fredCsvUrl: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) tutka-monitor/0.1',
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
  heatoilLiters: 1000, // a typical annual heating-oil fill-up
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
  // Gulf of Finland/Baltic, widened a little for NATO Baltic Air Policing
  // intercept tracks near Estonia and southern Finland approaches.
  bbox: { lamin: 58.0, lomin: 20.5, lamax: 61.5, lomax: 31.0 },
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
  // Dormant Hormuz-market metrics, kept readable/exportable (historical data,
  // not actively updated — see index.js for which jobs stopped being scheduled).
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
  'hpi',
  // Domain 1 (Nordic tension) and domain 3 (Information environment) — live.
  'gdelt_nordic_vol24h',
  'gdelt_nordic_median30d',
  'gdelt_nordic_tone',
  'nordic_index',
  'gdelt_infoenv_vol24h',
  'gdelt_infoenv_median30d',
  'gdelt_infoenv_tone',
  'infoenv_index',
  'nordic_vessels_in_zone',
  'nordic_unique_large_24h',
  'flights_count',
  'elec_spot',
  'pump_e95',
  'pump_diesel',
  'pump_heatoil',
  'stock_neste',
  'stock_finnair',
  'eurusd',
  'fi_cpi_yoy',
];
