// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeNordic } from '../indices/nordic.js';
import { NORDIC } from '../config.js';

const now = Date.now();
const freshInputs = () => ({
  V: { vol24h: 500, baseline: 100, ts: now }, // 5× calm → 100·(1−log10 5) ≈ 30.1
  T: { tone: -4, ts: now },                   // halfway to toneExtreme (-8) → score 50
});

test('both components fresh: weighted sum matches hand calculation', () => {
  const s = computeNordic(freshInputs(), now, null);
  assert.ok(s);
  const v = 100 * (1 - Math.log10(5));
  const t = 100 * (1 - (0 - -4) / (0 - -8));
  const expected = 0.6 * v + 0.4 * t;
  assert.ok(Math.abs(s.value - expected) < 0.11, `${s.value} vs ${expected}`);
  assert.deepEqual(s.used.sort(), ['T', 'V']);
});

test('stale tone component is dropped and weight renormalizes to V only', () => {
  const inputs = freshInputs();
  inputs.T.ts = now - 25 * 3600_000; // past the 24h T threshold
  const s = computeNordic(inputs, now, null);
  assert.ok(s);
  assert.deepEqual(s.used, ['V']);
  const v = 100 * (1 - Math.log10(5));
  assert.ok(Math.abs(s.value - v) < 0.11, `${s.value} vs ${v}`);
});

test('no fresh components → null, never a fabricated index', () => {
  const s = computeNordic({}, now, null);
  assert.equal(s, null);
});

test('very negative tone saturates at score 0, positive tone caps at score 100', () => {
  const extreme = computeNordic({ T: { tone: -20, ts: now } }, now, null);
  assert.ok(extreme);
  assert.equal(extreme.components.T.score, 0);

  const positive = computeNordic({ T: { tone: 3, ts: now } }, now, null);
  assert.ok(positive);
  assert.equal(positive.components.T.score, 100);
});

test('band names are nordic-specific, not reused from HPI or infoenv', () => {
  const names = NORDIC.bands.map((b) => b.name);
  assert.deepEqual(names, ['CALM', 'ELEVATED', 'HEIGHTENED', 'CRITICAL']);
});
