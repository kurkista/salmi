// @ts-check
// hpi.js — the Hormuz Passability Index. computeHPI() is a pure function
// (unit-tested in server/test/hpi.test.js); gatherAndCompute() feeds it from
// the database and persists/broadcasts snapshots. METHODOLOGY.md documents
// every choice made here — keep the two in sync.
import { HPI, POLYMARKET } from './config.js';
import { latestSeries, latestHpiSnapshot, putHpiSnapshot, putSeries } from './db.js';
import { bus } from './bus.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * @param {{
 *   T?: {value: number, ts: number} | null,          // PortWatch 7-day avg transits
 *   N?: {vol24h: number, median30d: number, ts: number} | null,
 *   P?: {p: number, direction: 'normal'|'closed', ts: number} | null,
 *   O?: {sigma: number, ts: number} | null,           // annualized 20d realized vol
 * }} inputs
 * @param {number} now
 * @param {string | null} prevBand  previous band name, for hysteresis
 */
export function computeHPI(inputs, now, prevBand = null) {
  /** @type {Record<string, {score: number, raw: any, ts: number}>} */
  const components = {};

  if (fresh(inputs.T, 'T', now)) {
    const t = inputs.T;
    components.T = {
      score: clamp(t.value / HPI.baselineTransitsPerDay, 0, 1) * 100,
      raw: { transits7dma: t.value, baseline: HPI.baselineTransitsPerDay },
      ts: t.ts,
    };
  }

  if (fresh(inputs.N, 'N', now) && inputs.N.median30d > 0) {
    const r = inputs.N.vol24h / inputs.N.median30d;
    components.N = {
      score: 100 * (1 - clamp(Math.log10(Math.max(r, 1)) / HPI.newsLog10Span, 0, 1)),
      raw: { vol24h: inputs.N.vol24h, median30d: inputs.N.median30d, ratio: r },
      ts: inputs.N.ts,
    };
  }

  if (fresh(inputs.P, 'P', now)) {
    const { p, direction } = inputs.P;
    components.P = {
      score: (direction === 'normal' ? p : 1 - p) * 100,
      raw: { p, direction },
      ts: inputs.P.ts,
    };
  }

  if (fresh(inputs.O, 'O', now)) {
    const { calm, extreme } = HPI.oilVol;
    components.O = {
      score: 100 * (1 - clamp((inputs.O.sigma - calm) / (extreme - calm), 0, 1)),
      raw: { sigma20: inputs.O.sigma },
      ts: inputs.O.ts,
    };
  }

  const used = Object.keys(components);
  if (used.length === 0) return null; // nothing fresh — no index rather than a lie

  // Weighted average over available components (weights renormalized so a
  // dropped component doesn't silently pull the index toward zero).
  let weightSum = 0;
  let acc = 0;
  for (const key of used) {
    acc += HPI.weights[key] * components[key].score;
    weightSum += HPI.weights[key];
  }
  const hpi = Math.round((acc / weightSum) * 10) / 10;

  return {
    ts: now,
    hpi,
    band: bandWithHysteresis(hpi, prevBand),
    components,
    used,
    version: HPI.version,
  };
}

/** @returns {input is any} */
function fresh(input, key, now) {
  return !!input && now - input.ts <= HPI.stalenessMs[key];
}

/**
 * Plain band lookup, then hysteresis: leaving the previous band requires
 * clearing the boundary by HPI.hysteresisPoints, one band step at a time.
 */
function bandWithHysteresis(hpi, prevBand) {
  const idxOf = (name) => HPI.bands.findIndex((b) => b.name === name);
  const plain = HPI.bands.find((b) => hpi >= b.min) ?? HPI.bands[HPI.bands.length - 1];
  if (!prevBand || idxOf(prevBand) === -1) return plain.name;

  let idx = idxOf(prevBand);
  for (let guard = 0; guard < HPI.bands.length; guard++) {
    // improving: step to the next-higher band only if we clear its floor + margin
    if (idx > 0 && hpi >= HPI.bands[idx - 1].min + HPI.hysteresisPoints) { idx--; continue; }
    // worsening: step down only if we fall below our floor − margin
    if (idx < HPI.bands.length - 1 && hpi < HPI.bands[idx].min - HPI.hysteresisPoints) { idx++; continue; }
    break;
  }
  return HPI.bands[idx].name;
}

let lastPersistTs = 0;

/** Reads latest inputs from the DB, computes, persists + broadcasts. */
export function gatherAndCompute(now = Date.now()) {
  const prev = latestHpiSnapshot();
  const t = latestSeries('pw_7dma');
  const vol = latestSeries('gdelt_vol24h');
  const med = latestSeries('gdelt_median30d');
  const p = latestSeries('poly_p');
  const sigma = latestSeries('brent_sigma20');

  const snapshot = computeHPI({
    T: t ? { value: t.value, ts: t.ts } : null,
    N: vol && med ? { vol24h: vol.value, median30d: med.value, ts: vol.ts } : null,
    P: p ? { p: p.value, direction: POLYMARKET.markets[0]?.direction ?? 'normal', ts: p.ts } : null,
    O: sigma ? { sigma: sigma.value, ts: sigma.ts } : null,
  }, now, prev?.band ?? null);

  if (!snapshot) return null;

  const bandChanged = prev && prev.band !== snapshot.band;
  if (!prev || bandChanged || now - lastPersistTs >= HPI.snapshotMs) {
    putHpiSnapshot(snapshot);
    putSeries('hpi', snapshot.ts, snapshot.hpi);
    lastPersistTs = now;
  }
  bus.emit('hpi', snapshot);
  if (bandChanged) {
    console.log(`[hpi] band change: ${prev.band} → ${snapshot.band} (${snapshot.hpi})`);
  }
  return snapshot;
}
