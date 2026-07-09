// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHPI } from '../hpi.js';
import { HPI } from '../config.js';

const now = Date.now();
const freshInputs = () => ({
  T: { value: 34, ts: now - 3600_000 },                       // 34/91.5 → 37.2
  N: { vol24h: 500, baseline: 100, ts: now },                 // 5× calm → 100·(1−log10 5) ≈ 30.1
  P: { p: 0.045, direction: /** @type {const} */ ('normal'), ts: now }, // 4.5
  O: { sigma: 0.65, ts: now },                                // (0.65−0.3)/0.7 → 50
});

test('all components fresh: weighted sum matches hand calculation', () => {
  const s = computeHPI(freshInputs(), now, null);
  assert.ok(s);
  const t = (34 / HPI.baselineTransitsPerDay) * 100;
  const n = 100 * (1 - Math.log10(5));
  const p = 4.5;
  const o = 50;
  const expected = 0.45 * t + 0.2 * n + 0.2 * p + 0.15 * o;
  assert.ok(Math.abs(s.hpi - expected) < 0.11, `${s.hpi} vs ${expected}`);
  assert.deepEqual(s.used.sort(), ['N', 'O', 'P', 'T']);
});

test('stale component is dropped and weights renormalize', () => {
  const inputs = freshInputs();
  inputs.N.ts = now - 4 * 3600_000; // past the 3h N threshold
  const s = computeHPI(inputs, now, null);
  assert.ok(s);
  assert.deepEqual(s.used.sort(), ['O', 'P', 'T']);
  const t = (34 / HPI.baselineTransitsPerDay) * 100;
  const expected = (0.45 * t + 0.2 * 4.5 + 0.15 * 50) / 0.8;
  assert.ok(Math.abs(s.hpi - expected) < 0.11, `${s.hpi} vs ${expected}`);
});

test('no fresh components → null, never a fabricated index', () => {
  const s = computeHPI({}, now, null);
  assert.equal(s, null);
});

test('band hysteresis: small wobble across a boundary keeps the previous band', () => {
  // 30 is the SEVERELY_DISRUPTED floor; 31 from EFFECTIVELY_CLOSED must not flip
  const mk = (tValue) => computeHPI(
    { T: { value: tValue, ts: now } }, now, 'EFFECTIVELY_CLOSED');
  // T-only: hpi = T score. 29 → stays closed; 31 → still closed (needs ≥32); 33 → flips
  assert.equal(mk(0.29 * HPI.baselineTransitsPerDay).band, 'EFFECTIVELY_CLOSED');
  assert.equal(mk(0.31 * HPI.baselineTransitsPerDay).band, 'EFFECTIVELY_CLOSED');
  assert.equal(mk(0.33 * HPI.baselineTransitsPerDay).band, 'SEVERELY_DISRUPTED');
});

test('closed-direction market inverts the probability', () => {
  const s = computeHPI(
    { P: { p: 0.9, direction: 'closed', ts: now } }, now, null);
  assert.ok(s);
  assert.ok(Math.abs(s.components.P.score - 10) < 1e-9);
});
