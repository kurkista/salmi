// @ts-check
// index.js — boot order: env → db → vessel store → AIS stream → pollers → http.
try { process.loadEnvFile(); } catch { /* no .env — fine in production */ }

import {
  DB_PATH, VESSELS, INFOENV, NORDIC, GDELT,
  ELECTRICITY, STATFIN, STOCKS, FX, OPENSKY,
} from './config.js';
import { openDb, putTransit, prune, transitsSince, upsertVesselsDaily, putSeries } from './db.js';
import { VesselStore } from './vessels.js';
import { startAis } from './ais.js';
import { startHttp } from './http.js';
import { register } from './scheduler.js';
import { bus } from './bus.js';
import { gatherAndComputeNordic } from './indices/nordic.js';
import { gatherAndComputeInfoEnv } from './indices/infoenv.js';
import { pollGdelt } from './pollers/gdelt.js';
import { pollElectricity } from './pollers/electricity.js';
import { pollPump } from './pollers/pump.js';
import { pollCpi } from './pollers/pxweb.js';
import { pollStocks } from './pollers/stocks.js';
import { pollFx } from './pollers/fx.js';
import { pollOpenSky } from './pollers/opensky.js';

openDb(DB_PATH);

const store = new VesselStore({
  onTransit(t) {
    putTransit(t);
    bus.emit('transit', { ts: t.ts, mmsi: t.mmsi, name: t.name, dir: t.dir });
    console.log(`[transit] ${t.dir} ${t.name ?? t.mmsi} (type ${t.shipType})`);
  },
});

startAis((msg) => store.ingest(msg));
startHttp({ store });

// --- vessel housekeeping -----------------------------------------------------

// dirty-vessel deltas to browsers, at most every 5 s
setInterval(() => {
  const delta = store.collectDeltas();
  if (delta) bus.emit('vessels', delta);
}, VESSELS.broadcastThrottleMs);

setInterval(() => store.sweep(), VESSELS.sweepMs).unref?.();

// hourly presence series
setInterval(() => {
  const now = Date.now();
  putSeries('nordic_vessels_in_zone', now, store.countInZone());
  const u = store.uniqueLargeToday();
  putSeries('nordic_unique_large_24h', now, u.tankers + u.cargo);
}, 3600_000).unref?.();

// UTC-midnight rollover → persist yesterday's aggregate (transit counts come
// from the DB so a restart during the day doesn't zero them)
setInterval(() => {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== store.day.date) {
    const fin = store.rolloverDay(today);
    const dayStart = Date.parse(fin.date);
    const dayEnd = dayStart + 24 * 3600_000;
    const inCount = countTransitsBetween(dayStart, dayEnd, 'in');
    const outCount = countTransitsBetween(dayStart, dayEnd, 'out');
    upsertVesselsDaily({
      date: fin.date,
      transitsIn: inCount,
      transitsOut: outCount,
      uniqueTankers: fin.uniqueTankers,
      uniqueCargo: fin.uniqueCargo,
    });
    console.log(`[vessels] daily rollover ${fin.date}: ${inCount} in / ${outCount} out`);
  }
}, 60_000).unref?.();

function countTransitsBetween(startTs, endTs, dir) {
  return transitsSince(startTs, 5000).filter((t) => t.ts < endTs && t.dir === dir).length;
}

// --- pollers -------------------------------------------------------------------
// Hormuz's market pollers (Brent, Polymarket, PortWatch) and its HPI recompute
// are retired — no Baltic equivalent exists for any of them. The files
// (hpi.js, pollers/brent.js, pollers/polymarket.js, pollers/portwatch.js)
// stay in the repo, just unscheduled, per "not delete, stop investing".

register('gdelt_nordic', () => pollGdelt(GDELT.modules.nordic), GDELT.modules.nordic.pollMs);
register('gdelt_infoenv', () => pollGdelt(GDELT.modules.infoenv), GDELT.modules.infoenv.pollMs);
register('electricity', pollElectricity, ELECTRICITY.pollMs);
register('pump', pollPump, STATFIN.pollMs);
register('cpi', pollCpi, STATFIN.pollMs);
register('stocks', pollStocks, STOCKS.pollMs);
register('fx', pollFx, FX.pollMs);
if (OPENSKY.clientId && OPENSKY.clientSecret) {
  register('opensky', pollOpenSky, OPENSKY.pollMs);
} else {
  console.warn('[main] OpenSky credentials not set — flight layer disabled.');
}
register('nordic_index', async () => { gatherAndComputeNordic(); }, NORDIC.recomputeMs);
register('infoenv_index', async () => { gatherAndComputeInfoEnv(); }, INFOENV.recomputeMs);
register('prune', async () => { prune(); }, 24 * 3600_000);

// --- shutdown --------------------------------------------------------------------

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[main] ${sig} — shutting down`);
    process.exit(0);
  });
}
