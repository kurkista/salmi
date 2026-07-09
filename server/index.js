// @ts-check
// index.js — boot order: env → db → vessel store → AIS stream → pollers → http.
try { process.loadEnvFile(); } catch { /* no .env — fine in production */ }

import { DB_PATH, VESSELS, HPI, POLYMARKET, GDELT, BRENT, PORTWATCH } from './config.js';
import { openDb, putTransit, prune, transitsSince, upsertVesselsDaily, putSeries } from './db.js';
import { VesselStore } from './vessels.js';
import { startAis } from './ais.js';
import { startHttp } from './http.js';
import { register } from './scheduler.js';
import { bus } from './bus.js';
import { gatherAndCompute } from './hpi.js';
import { pollBrentHistory, pollBrentQuote } from './pollers/brent.js';
import { pollPolymarket } from './pollers/polymarket.js';
import { pollGdelt } from './pollers/gdelt.js';
import { pollPortwatch } from './pollers/portwatch.js';

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
  putSeries('vessels_in_strait', now, store.countInStrait());
  const u = store.uniqueLargeToday();
  putSeries('unique_large_24h', now, u.tankers + u.cargo);
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

register('brent_history', pollBrentHistory, BRENT.historyPollMs);
register('brent_quote', pollBrentQuote, BRENT.quotePollMs);
register('polymarket', pollPolymarket, POLYMARKET.pollMs);
register('gdelt', pollGdelt, GDELT.pollMs);
register('portwatch', pollPortwatch, PORTWATCH.pollMs);
register('hpi', async () => { gatherAndCompute(); }, HPI.recomputeMs);
register('prune', async () => { prune(); }, 24 * 3600_000);

// --- shutdown --------------------------------------------------------------------

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[main] ${sig} — shutting down`);
    process.exit(0);
  });
}
