// @ts-check
// db.js — SQLite via node:sqlite (built-in, no native dependency to compile).
// Single process, single writer; synchronous API is fine at our write rates.
import { DatabaseSync } from 'node:sqlite';

/** @type {DatabaseSync} */
let db;

export function openDb(path) {
  db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS series (
      metric TEXT NOT NULL,
      ts INTEGER NOT NULL, -- unix ms
      value REAL NOT NULL,
      PRIMARY KEY (metric, ts)
    );

    CREATE TABLE IF NOT EXISTS transits (
      id INTEGER PRIMARY KEY,
      ts INTEGER NOT NULL,
      mmsi INTEGER NOT NULL,
      name TEXT,
      ship_type INTEGER,
      dir TEXT CHECK (dir IN ('in','out')),
      lat REAL,
      lon REAL
    );
    CREATE INDEX IF NOT EXISTS idx_transits_ts ON transits (ts);

    CREATE TABLE IF NOT EXISTS vessels_daily (
      date TEXT PRIMARY KEY, -- YYYY-MM-DD (UTC)
      transits_in INTEGER,
      transits_out INTEGER,
      unique_tankers INTEGER,
      unique_cargo INTEGER
    );

    CREATE TABLE IF NOT EXISTS headlines (
      id INTEGER PRIMARY KEY,
      ts INTEGER NOT NULL,
      title TEXT NOT NULL,
      url TEXT UNIQUE NOT NULL,
      source TEXT,
      tone REAL
    );
    CREATE INDEX IF NOT EXISTS idx_headlines_ts ON headlines (ts);

    CREATE TABLE IF NOT EXISTS hpi_snapshots (
      ts INTEGER PRIMARY KEY,
      hpi REAL NOT NULL,
      band TEXT NOT NULL,
      components TEXT NOT NULL, -- JSON: per-component score/raw/ts + used[]
      version TEXT NOT NULL
    );
  `);
  return db;
}

// --- series -----------------------------------------------------------------

export function putSeries(metric, ts, value) {
  db.prepare('INSERT OR REPLACE INTO series (metric, ts, value) VALUES (?, ?, ?)')
    .run(metric, ts, value);
}

/** @returns {{ts: number, value: number} | undefined} */
export function latestSeries(metric) {
  return /** @type {any} */ (
    db.prepare('SELECT ts, value FROM series WHERE metric = ? ORDER BY ts DESC LIMIT 1')
      .get(metric)
  );
}

/** @returns {Array<{ts: number, value: number}>} */
export function seriesSince(metric, sinceTs) {
  return /** @type {any} */ (
    db.prepare('SELECT ts, value FROM series WHERE metric = ? AND ts >= ? ORDER BY ts')
      .all(metric, sinceTs)
  );
}

// --- transits ---------------------------------------------------------------

export function putTransit(t) {
  db.prepare(
    'INSERT INTO transits (ts, mmsi, name, ship_type, dir, lat, lon) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(t.ts, t.mmsi, t.name ?? null, t.shipType ?? null, t.dir, t.lat ?? null, t.lon ?? null);
}

export function countTransitsSince(sinceTs) {
  const row = /** @type {any} */ (
    db.prepare('SELECT COUNT(*) AS n FROM transits WHERE ts >= ?').get(sinceTs)
  );
  return row.n;
}

/** @returns {Array<any>} */
export function transitsSince(sinceTs, limit = 500) {
  return /** @type {any} */ (
    db.prepare('SELECT ts, mmsi, name, ship_type, dir FROM transits WHERE ts >= ? ORDER BY ts DESC LIMIT ?')
      .all(sinceTs, limit)
  );
}

export function upsertVesselsDaily(row) {
  db.prepare(`
    INSERT INTO vessels_daily (date, transits_in, transits_out, unique_tankers, unique_cargo)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      transits_in = excluded.transits_in,
      transits_out = excluded.transits_out,
      unique_tankers = excluded.unique_tankers,
      unique_cargo = excluded.unique_cargo
  `).run(row.date, row.transitsIn, row.transitsOut, row.uniqueTankers, row.uniqueCargo);
}

/** @returns {Array<any>} */
export function vesselsDailySince(sinceDate) {
  return /** @type {any} */ (
    db.prepare('SELECT * FROM vessels_daily WHERE date >= ? ORDER BY date').all(sinceDate)
  );
}

// --- headlines ----------------------------------------------------------------

export function putHeadline(h) {
  db.prepare(
    'INSERT OR IGNORE INTO headlines (ts, title, url, source, tone) VALUES (?, ?, ?, ?, ?)'
  ).run(h.ts, h.title, h.url, h.source ?? null, h.tone ?? null);
}

/** @returns {Array<any>} */
export function recentHeadlines(limit = 20) {
  return /** @type {any} */ (
    db.prepare('SELECT ts, title, url, source, tone FROM headlines ORDER BY ts DESC LIMIT ?')
      .all(limit)
  );
}

// --- hpi ----------------------------------------------------------------------

export function putHpiSnapshot(s) {
  db.prepare(
    'INSERT OR REPLACE INTO hpi_snapshots (ts, hpi, band, components, version) VALUES (?, ?, ?, ?, ?)'
  ).run(s.ts, s.hpi, s.band, JSON.stringify(s.components), s.version);
}

/** @returns {any | undefined} */
export function latestHpiSnapshot() {
  const row = /** @type {any} */ (
    db.prepare('SELECT * FROM hpi_snapshots ORDER BY ts DESC LIMIT 1').get()
  );
  if (row) row.components = JSON.parse(row.components);
  return row;
}

// --- maintenance ---------------------------------------------------------------

// Nightly prune: intraday metrics don't need to outlive 90 days (daily series
// like brent_usd / pw_total are kept forever); headlines capped at 5000 rows.
export function prune(now = Date.now()) {
  const cutoff = now - 90 * 24 * 3600_000;
  db.prepare(
    "DELETE FROM series WHERE metric IN ('brent_intraday','vessels_in_strait','unique_large_24h') AND ts < ?"
  ).run(cutoff);
  db.prepare(`
    DELETE FROM headlines WHERE id NOT IN (
      SELECT id FROM headlines ORDER BY ts DESC LIMIT 5000
    )
  `).run();
}
