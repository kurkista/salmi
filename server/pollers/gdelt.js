// @ts-check
// gdelt.js — news volume, tone and headlines from the GDELT DOC 2.0 API
// (free, no key). Two ingest paths share the store functions below:
//   1. pollGdelt() — direct fetch from this server. On fly.io the shared IPv4
//      egress NAT is often refused/429'd by GDELT, so this path is unreliable
//      there (it stays because it works fine locally and may work on fly
//      off-peak).
//   2. POST /api/ingest/gdelt — the news-relay GitHub Action fetches the same
//      queries from runner IPs and pushes the raw JSON here (see
//      .github/workflows/news-relay.yml).
import { GDELT } from '../config.js';
import { putSeries, putHeadline, latestSeries } from '../db.js';
import { bus } from '../bus.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GDELT rate-limits per IP and answers with an HTTP 200 *text* page or a 429;
// each query retries with spaced jitter to find a quota window.
async function docQuery(params) {
  let lastErr;
  const attempts = 6;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await docQueryOnce(params);
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) await sleep(20_000 + Math.random() * 20_000);
    }
  }
  throw lastErr;
}

async function docQueryOnce(params) {
  const url = `${GDELT.docUrl}?query=${encodeURIComponent(GDELT.query)}&${params}&format=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': GDELT.userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`gdelt ${res.status}`);
  if (!text.trimStart().startsWith('{')) {
    throw new Error(`gdelt non-JSON response (rate limited?): ${text.slice(0, 80)}`);
  }
  return JSON.parse(text);
}

/** GDELT timeline dates look like "20260709T121500Z" or "20260709120000". */
function parseGdeltDate(s) {
  const d = String(s).replace(/\D/g, '').padEnd(14, '0');
  return Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +d.slice(8, 10), +d.slice(10, 12), +d.slice(12, 14));
}

function timelinePoints(json) {
  return (json?.timeline?.[0]?.data || []).map((p) => ({
    ts: parseGdeltDate(p.date),
    value: Number(p.value) || 0,
  }));
}

// --- store functions (shared by poller and /api/ingest/gdelt) ---------------

/** 30d raw-volume timeline → gdelt_vol24h + gdelt_median30d. */
export function storeGdeltVolume(volJson, now = Date.now()) {
  const points = timelinePoints(volJson);
  if (points.length === 0) throw new Error('gdelt: empty volume timeline');

  const vol24h = points.filter((p) => p.ts >= now - 24 * 3600_000).reduce((a, p) => a + p.value, 0);
  /** @type {Record<string, number>} */
  const byDay = {};
  for (const p of points) {
    const day = new Date(p.ts).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + p.value;
  }
  const today = new Date(now).toISOString().slice(0, 10);
  const dailySums = Object.entries(byDay).filter(([d]) => d !== today).map(([, v]) => v).sort((a, b) => a - b);
  const median30d = dailySums.length ? dailySums[Math.floor(dailySums.length / 2)] : 0;

  putSeries('gdelt_vol24h', now, vol24h);
  putSeries('gdelt_median30d', now, median30d);
  bus.emit('metric', { metric: 'gdelt_vol24h', ts: now, value: vol24h });
}

/** Calm-2025 raw-volume timeline → gdelt_base_daily (median day, HPI N baseline). */
export function storeGdeltCalm(calJson, now = Date.now()) {
  const points = timelinePoints(calJson);
  /** @type {Record<string, number>} */
  const byDay = {};
  for (const p of points) {
    const day = new Date(p.ts).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + p.value;
  }
  const sums = Object.values(byDay).sort((a, b) => a - b);
  if (sums.length < 30) throw new Error('gdelt: calm window too short');
  putSeries('gdelt_base_daily', now, sums[Math.floor(sums.length / 2)]);
}

/** 2d tone timeline → gdelt_tone (24h average). */
export function storeGdeltTone(toneJson, now = Date.now()) {
  const points = timelinePoints(toneJson).filter((p) => Number.isFinite(p.value) && p.ts >= now - 24 * 3600_000);
  if (points.length === 0) return;
  const avg = points.reduce((a, p) => a + p.value, 0) / points.length;
  putSeries('gdelt_tone', now, avg);
  bus.emit('metric', { metric: 'gdelt_tone', ts: now, value: avg });
}

/** artlist → headlines table + SSE. */
export function storeGdeltHeadlines(artJson, now = Date.now()) {
  for (const a of artJson?.articles || []) {
    if (!a.url || !a.title) continue;
    const h = {
      ts: a.seendate ? parseGdeltDate(a.seendate) : now,
      title: String(a.title).slice(0, 300),
      url: a.url,
      source: a.domain || null,
      tone: null,
    };
    putHeadline(h);
    bus.emit('headline', h);
  }
}

/**
 * Ingest entry point for the news relay: any subset of the four raw GDELT
 * responses. Returns the list of parts stored (for the relay's log).
 */
export function storeGdeltPayload({ volume, tone, articles, calm } = {}, now = Date.now()) {
  /** @type {string[]} */
  const stored = [];
  if (volume) { storeGdeltVolume(volume, now); stored.push('volume'); }
  if (calm) { storeGdeltCalm(calm, now); stored.push('calm'); }
  if (tone) { try { storeGdeltTone(tone, now); stored.push('tone'); } catch { /* optional */ } }
  if (articles) { try { storeGdeltHeadlines(articles, now); stored.push('articles'); } catch { /* optional */ } }
  if (stored.length === 0) throw new Error('gdelt ingest: no recognizable payload parts');
  return stored;
}

// --- direct poller -----------------------------------------------------------

export async function pollGdelt() {
  const now = Date.now();

  const vol = await docQuery('mode=timelinevolraw&timespan=30d');
  storeGdeltVolume(vol, now);

  // Calm-period baseline for the HPI N component: median daily article count
  // over 2025 (the last pre-crisis year). A trailing median would drift up
  // during a sustained crisis and make it read as calm — this must not.
  const base = latestSeries('gdelt_base_daily');
  if (!base || now - base.ts > 7 * 24 * 3600_000) {
    await sleep(GDELT.spacingMs);
    const cal = await docQuery(
      `mode=timelinevolraw&startdatetime=${GDELT.calmStart}&enddatetime=${GDELT.calmEnd}`,
    );
    storeGdeltCalm(cal, now);
  }

  await sleep(GDELT.spacingMs);
  try {
    storeGdeltTone(await docQuery('mode=timelinetone&timespan=2d'), now);
  } catch (err) {
    console.warn('[gdelt] tone fetch failed (volume succeeded):', err instanceof Error ? err.message : err);
  }

  await sleep(GDELT.spacingMs);
  try {
    storeGdeltHeadlines(await docQuery(`mode=artlist&maxrecords=${GDELT.headlineCount}&sort=datedesc`), now);
  } catch (err) {
    console.warn('[gdelt] headlines fetch failed (volume succeeded):', err instanceof Error ? err.message : err);
  }
}
