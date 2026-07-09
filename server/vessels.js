// @ts-check
// vessels.js — in-memory vessel store + gate-line transit detection.
// This is the hardest correctness problem in salmi; the rules are spelled out
// in METHODOLOGY.md §Transit counting and every constant lives in config.js.
//
// Gate logic in short: a large vessel (AIS type 70–89) gets a confirmed side
// of the 56.5°E gate meridian only when it is >3 km away from it (hysteresis).
// A confirmed WEST→EAST or EAST→WEST flip counts as one transit, if the vessel
// was moving (sog ≥ 3 kn), the flip happened within 6 h, and the vessel hasn't
// been counted in the last 2 h.
import { GATE, VESSELS } from './config.js';

/**
 * @typedef {{
 *   mmsi: number, name: string|null, shipType: number|null,
 *   lat: number, lon: number, cog: number|null, sog: number|null, hdg: number|null,
 *   lastSeen: number, gateSide: 'W'|'E'|null, sideConfirmedTs: number,
 *   lastTransitTs: number, dirty: boolean
 * }} Vessel
 */

export class VesselStore {
  /**
   * @param {{onTransit?: (t: any) => void}} [hooks]
   */
  constructor(hooks = {}) {
    /** @type {Map<number, Vessel>} */
    this.vessels = new Map();
    this.onTransit = hooks.onTransit || (() => {});
    /** @type {number[]} */
    this.pendingRemovals = [];
    // Per-UTC-day sets of large vessels seen, for the daily aggregate.
    this.day = this._freshDay(new Date().toISOString().slice(0, 10));
    this.transitsToday = { in: 0, out: 0 };
  }

  _freshDay(date) {
    return { date, tankers: new Set(), cargo: new Set() };
  }

  /**
   * Ingest one AISStream envelope.
   * @param {any} msg
   * @param {number} [now]
   */
  ingest(msg, now = Date.now()) {
    const meta = msg.MetaData;
    if (!meta || typeof meta.MMSI !== 'number') return;
    if (msg.MessageType === 'PositionReport') {
      const pos = msg.Message?.PositionReport;
      if (!pos) return;
      this._position(meta, pos, now);
    } else if (msg.MessageType === 'ShipStaticData') {
      const stat = msg.Message?.ShipStaticData;
      if (!stat) return;
      this._static(meta, stat, now);
    }
  }

  /** @param {any} meta @param {any} pos @param {number} now */
  _position(meta, pos, now) {
    const lat = pos.Latitude ?? meta.latitude;
    const lon = pos.Longitude ?? meta.longitude;
    const sog = typeof pos.Sog === 'number' ? pos.Sog : null;
    if (typeof lat !== 'number' || typeof lon !== 'number') return;
    // Spoofing / garbage filters: outside our bbox or implausibly fast.
    if (lat < 24 || lat > 28 || lon < 54 || lon > 58.5) return;
    if (sog !== null && sog > VESSELS.maxPlausibleSogKn) return;

    const v = this._get(meta.MMSI, now);
    v.lat = lat;
    v.lon = lon;
    v.cog = typeof pos.Cog === 'number' ? pos.Cog : v.cog;
    v.sog = sog ?? v.sog;
    // TrueHeading 511 = "not available" in the AIS spec
    v.hdg = typeof pos.TrueHeading === 'number' && pos.TrueHeading !== 511 ? pos.TrueHeading : v.hdg;
    v.lastSeen = now;
    v.dirty = true;
    if (!v.name && meta.ShipName) v.name = String(meta.ShipName).trim() || null;

    this._trackDailyPresence(v);
    this._gate(v, now);
  }

  /** @param {any} meta @param {any} stat @param {number} now */
  _static(meta, stat, now) {
    const v = this._get(meta.MMSI, now);
    if (typeof stat.Type === 'number' && stat.Type > 0) v.shipType = stat.Type;
    const name = (stat.Name || meta.ShipName || '').trim();
    if (name) v.name = name;
    v.lastSeen = now;
    this._trackDailyPresence(v);
  }

  /** @param {number} mmsi @param {number} now @returns {Vessel} */
  _get(mmsi, now) {
    let v = this.vessels.get(mmsi);
    if (!v) {
      v = {
        mmsi, name: null, shipType: null, lat: 0, lon: 0, cog: null, sog: null,
        hdg: null, lastSeen: now, gateSide: null, sideConfirmedTs: 0,
        lastTransitTs: 0, dirty: true,
      };
      this.vessels.set(mmsi, v);
    }
    return v;
  }

  _isLarge(v) {
    return v.shipType !== null && v.shipType >= GATE.shipTypeMin && v.shipType <= GATE.shipTypeMax;
  }

  _isTanker(v) {
    return v.shipType !== null && v.shipType >= 80 && v.shipType <= 89;
  }

  /** @param {Vessel} v */
  _trackDailyPresence(v) {
    if (!this._isLarge(v)) return;
    (this._isTanker(v) ? this.day.tankers : this.day.cargo).add(v.mmsi);
  }

  /**
   * Gate-crossing detection. Only large vessels inside the gate latitude band
   * participate; a side is confirmed only outside the ±3 km dead zone.
   * @param {Vessel} v @param {number} now
   */
  _gate(v, now) {
    if (!this._isLarge(v)) return;
    if (v.lat < GATE.latMin - 0.3 || v.lat > GATE.latMax + 0.3) return;

    /** @type {'W'|'E'|null} */
    let side = null;
    if (v.lon < GATE.lon - GATE.hysteresisDegLon) side = 'W';
    else if (v.lon > GATE.lon + GATE.hysteresisDegLon) side = 'E';
    if (!side) return; // inside the dead zone — no opinion

    if (v.gateSide && v.gateSide !== side) {
      const flipAgeMs = now - v.sideConfirmedTs;
      const movedRecently = (v.sog ?? 0) >= GATE.minSogKn;
      const withinWindow = flipAgeMs < GATE.maxCrossingHours * 3600_000;
      const pastCooldown = now - v.lastTransitTs > GATE.cooldownHours * 3600_000;
      if (movedRecently && withinWindow && pastCooldown) {
        // E→W = entering the Persian Gulf ('in'); W→E = leaving ('out')
        const dir = side === 'W' ? 'in' : 'out';
        v.lastTransitTs = now;
        this.transitsToday[dir]++;
        this.onTransit({
          ts: now, mmsi: v.mmsi, name: v.name, shipType: v.shipType,
          dir, lat: v.lat, lon: v.lon,
        });
      }
    }
    v.gateSide = side;
    v.sideConfirmedTs = now;
  }

  /**
   * Drop vessels not heard from in VESSELS.staleMinutes; enforce the hard cap.
   * Removed MMSIs are queued so the next delta broadcast tells browsers.
   * @param {number} [now]
   */
  sweep(now = Date.now()) {
    const cutoff = now - VESSELS.staleMinutes * 60_000;
    for (const [mmsi, v] of this.vessels) {
      if (v.lastSeen < cutoff) {
        this.vessels.delete(mmsi);
        this.pendingRemovals.push(mmsi);
      }
    }
    if (this.vessels.size > VESSELS.maxEntries) {
      const byAge = [...this.vessels.values()].sort((a, b) => a.lastSeen - b.lastSeen);
      for (const v of byAge.slice(0, this.vessels.size - VESSELS.maxEntries)) {
        this.vessels.delete(v.mmsi);
        this.pendingRemovals.push(v.mmsi);
      }
    }
  }

  /** Dirty-only delta for SSE broadcast; clears dirty flags and removals. */
  collectDeltas() {
    const upsert = [];
    for (const v of this.vessels.values()) {
      if (v.dirty) {
        upsert.push(this._compact(v));
        v.dirty = false;
      }
    }
    const remove = this.pendingRemovals;
    this.pendingRemovals = [];
    if (upsert.length === 0 && remove.length === 0) return null;
    return { upsert, remove };
  }

  /** Full snapshot for /api/state bootstrap. */
  snapshot() {
    return [...this.vessels.values()].map((v) => this._compact(v));
  }

  _compact(v) {
    return {
      mmsi: v.mmsi, name: v.name, type: v.shipType,
      lat: Math.round(v.lat * 1e5) / 1e5, lon: Math.round(v.lon * 1e5) / 1e5,
      sog: v.sog, cog: v.cog, hdg: v.hdg, seen: v.lastSeen,
    };
  }

  /** Vessels currently inside the strait proper (for the hourly series). */
  countInStrait() {
    let n = 0;
    for (const v of this.vessels.values()) {
      if (v.lat >= 25.5 && v.lat <= 27.2 && v.lon >= 55.5 && v.lon <= 57.3) n++;
    }
    return n;
  }

  uniqueLargeToday() {
    return { tankers: this.day.tankers.size, cargo: this.day.cargo.size };
  }

  /**
   * UTC-midnight rollover: returns yesterday's aggregate row and resets the
   * per-day sets. Transit counts come from the caller (the DB is the source
   * of truth there; in-memory counters die on restart).
   * @param {string} newDate YYYY-MM-DD
   */
  rolloverDay(newDate) {
    const finished = {
      date: this.day.date,
      uniqueTankers: this.day.tankers.size,
      uniqueCargo: this.day.cargo.size,
    };
    this.day = this._freshDay(newDate);
    this.transitsToday = { in: 0, out: 0 };
    return finished;
  }
}
