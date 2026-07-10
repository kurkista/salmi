// @ts-check
// indices/nordic.js — the Nordic Tension Index: domain 1's real content
// (State & military tension), rebuilt for Finland/Baltic after retiring
// Hormuz as the flagship domain. Same two-part shape as ../hpi.js and
// ./infoenv.js (domain-specific component scoring + the shared engine in
// ./engine.js) — no clean daily official series exists for Nordic military
// tension the way IMF PortWatch did for Hormuz, so GDELT news pressure is
// the real anchor here, same as it is for infoenv. Live AIS vessels/flights
// (repointed to the Gulf of Finland) are shown as this domain's live layers,
// not scored — raw vessel/flight counts aren't an obviously honest tension
// signal the way Hormuz's transit-count drop was. METHODOLOGY.md documents
// the rationale.
import { NORDIC } from '../config.js';
import { latestSeries, latestIndexSnapshot, putIndexSnapshot, putSeries } from '../db.js';
import { bus } from '../bus.js';
import { clamp, computeIndex } from './engine.js';

const INDEX_NAME = 'nordic';

/** @returns {input is any} */
function fresh(input, key, now) {
  return !!input && now - input.ts <= NORDIC.stalenessMs[key];
}

/**
 * @param {{
 *   V?: {vol24h: number, baseline: number, ts: number} | null, // GDELT 24h volume vs calm baseline
 *   T?: {tone: number, ts: number} | null,                     // GDELT 24h average tone
 * }} inputs
 * @param {number} now
 * @param {string | null} prevBand
 */
export function computeNordic(inputs, now, prevBand = null) {
  /** @type {Record<string, {score: number, raw: any, ts: number}>} */
  const components = {};

  if (fresh(inputs.V, 'V', now) && inputs.V.baseline > 0 && inputs.V.vol24h > 0) {
    const r = inputs.V.vol24h / inputs.V.baseline;
    components.V = {
      score: 100 * (1 - clamp(Math.log10(Math.max(r, 1)) / NORDIC.newsLog10Span, 0, 1)),
      raw: { vol24h: inputs.V.vol24h, calmBaseline: inputs.V.baseline, ratio: r },
      ts: inputs.V.ts,
    };
  }

  if (fresh(inputs.T, 'T', now)) {
    const { toneCalm, toneExtreme } = NORDIC;
    components.T = {
      score: 100 * (1 - clamp((toneCalm - inputs.T.tone) / (toneCalm - toneExtreme), 0, 1)),
      raw: { tone: inputs.T.tone },
      ts: inputs.T.ts,
    };
  }

  const result = computeIndex({
    components,
    config: { weights: NORDIC.weights, bands: NORDIC.bands, hysteresisPoints: NORDIC.hysteresisPoints, version: NORDIC.version },
    now,
    prevBand,
  });
  if (!result) return null; // nothing fresh — no index rather than a lie

  return result; // {ts, value, band, components, used, version}
}

let lastPersistTs = 0;

/** Reads latest GDELT nordic inputs from the DB, computes, persists + broadcasts. */
export function gatherAndComputeNordic(now = Date.now()) {
  const prev = latestIndexSnapshot(INDEX_NAME);
  const vol = latestSeries('gdelt_nordic_vol24h');
  const base = latestSeries('gdelt_nordic_base_daily');
  const tone = latestSeries('gdelt_nordic_tone');

  const snapshot = computeNordic({
    V: vol && base ? { vol24h: vol.value, baseline: base.value, ts: vol.ts } : null,
    T: tone ? { tone: tone.value, ts: tone.ts } : null,
  }, now, prev?.band ?? null);

  if (!snapshot) return null;

  const bandChanged = prev && prev.band !== snapshot.band;
  if (!prev || bandChanged || now - lastPersistTs >= NORDIC.snapshotMs) {
    putIndexSnapshot(INDEX_NAME, snapshot);
    putSeries('nordic_index', snapshot.ts, snapshot.value);
    lastPersistTs = now;
  }
  bus.emit('nordic_index', snapshot);
  if (bandChanged) {
    console.log(`[nordic] band change: ${prev.band} → ${snapshot.band} (${snapshot.value})`);
  }
  return snapshot;
}
