// @ts-check
// Gate-crossing detection is disabled by default (GATE.enabled=false — no
// single chokepoint meridian exists in the open Baltic the way Hormuz's
// narrows has one). These tests exercise the retained logic in isolation by
// re-enabling it and restoring the Hormuz bbox/geometry it was built against,
// rather than deleting still-correct, still-useful test coverage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VesselStore } from '../vessels.js';
import { GATE, AIS } from '../config.js';

GATE.enabled = true;
AIS.boundingBox = [[24.5, 54.5], [27.5, 58.0]];

const t0 = Date.parse('2026-07-09T06:00:00Z');
const MIN = 60_000;

function posMsg(mmsi, lat, lon, sog = 12) {
  return {
    MessageType: 'PositionReport',
    MetaData: { MMSI: mmsi, ShipName: 'TESTSHIP', latitude: lat, longitude: lon },
    Message: { PositionReport: { Latitude: lat, Longitude: lon, Sog: sog, Cog: 90, TrueHeading: 90 } },
  };
}

function staticMsg(mmsi, type) {
  return {
    MessageType: 'ShipStaticData',
    MetaData: { MMSI: mmsi, ShipName: 'TESTSHIP' },
    Message: { ShipStaticData: { Type: type, Name: 'TESTSHIP' } },
  };
}

function mkStore() {
  /** @type {any[]} */
  const transits = [];
  const store = new VesselStore({ onTransit: (t) => transits.push(t) });
  return { store, transits };
}

test('tanker crossing W→E counts exactly one "out" transit', () => {
  const { store, transits } = mkStore();
  store.ingest(staticMsg(1, 82), t0); // tanker
  store.ingest(posMsg(1, 26.4, 56.30), t0);            // confirmed W
  store.ingest(posMsg(1, 26.4, 56.49), t0 + 10 * MIN); // dead zone — no opinion
  store.ingest(posMsg(1, 26.4, 56.55), t0 + 20 * MIN); // confirmed E → transit
  store.ingest(posMsg(1, 26.4, 56.70), t0 + 30 * MIN); // still E — no double count
  assert.equal(transits.length, 1);
  assert.equal(transits[0].dir, 'out');
  assert.equal(transits[0].mmsi, 1);
});

test('GPS jitter inside the dead zone never counts', () => {
  const { store, transits } = mkStore();
  store.ingest(staticMsg(2, 70), t0);
  for (let i = 0; i < 20; i++) {
    store.ingest(posMsg(2, 26.4, 56.49 + (i % 2) * 0.02), t0 + i * MIN); // 56.49↔56.51
  }
  assert.equal(transits.length, 0);
});

test('slow drifter does not count', () => {
  const { store, transits } = mkStore();
  store.ingest(staticMsg(3, 82), t0);
  store.ingest(posMsg(3, 26.4, 56.30, 1.0), t0);
  store.ingest(posMsg(3, 26.4, 56.60, 1.0), t0 + 60 * MIN); // sog < 3 kn
  assert.equal(transits.length, 0);
});

test('non-cargo ship types are ignored by the gate', () => {
  const { store, transits } = mkStore();
  store.ingest(staticMsg(4, 30), t0); // fishing vessel
  store.ingest(posMsg(4, 26.4, 56.30), t0);
  store.ingest(posMsg(4, 26.4, 56.60), t0 + 30 * MIN);
  assert.equal(transits.length, 0);
});

test('cooldown blocks an immediate return crossing, allows one after 2h', () => {
  const { store, transits } = mkStore();
  store.ingest(staticMsg(5, 82), t0);
  store.ingest(posMsg(5, 26.4, 56.30), t0);
  store.ingest(posMsg(5, 26.4, 56.60), t0 + 30 * MIN);       // out ✓
  store.ingest(posMsg(5, 26.4, 56.30), t0 + 60 * MIN);       // back within cooldown ✗
  assert.equal(transits.length, 1);
  store.ingest(posMsg(5, 26.4, 56.60), t0 + 200 * MIN);      // past 2h cooldown ✓
  assert.equal(transits.length, 2);
});

test('side flip older than 6h (reappearing ship) does not count', () => {
  const { store, transits } = mkStore();
  store.ingest(staticMsg(6, 82), t0);
  store.ingest(posMsg(6, 26.4, 56.30), t0);
  store.ingest(posMsg(6, 26.4, 56.60), t0 + 7 * 60 * MIN); // gap > 6h
  assert.equal(transits.length, 0);
});
