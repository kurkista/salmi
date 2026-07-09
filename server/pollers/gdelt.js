// @ts-check
// gdelt.js — news volume, tone and headlines from the GDELT DOC 2.0 API
// (free, no key). GDELT asks for ≥5 s between requests and answers rate
// limits with an HTTP 200 *text* page — we detect that and treat it as an
// error so the scheduler records it and the N component goes stale honestly.
import { GDELT } from '../config.js';
import { putSeries, putHeadline } from '../db.js';
import { bus } from '../bus.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GDELT rate-limits per IP, and on fly.io the IPv4 egress NAT is shared with
// other customers — so 429s happen through no fault of our own cadence.
// Each query retries a few times with spaced jitter to find a quota window.
async function docQuery(params) {
  let lastErr;
  const attempts = 6; // ~25% per-request success observed on fly → ~82%/query
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

export async function pollGdelt() {
  const now = Date.now();

  // 1) raw article volume, 30 days — gives both the 24h sum and the
  //    trailing median that normalizes it.
  const vol = await docQuery('mode=timelinevolraw&timespan=30d');
  const points = (vol.timeline?.[0]?.data || []).map((p) => ({
    ts: parseGdeltDate(p.date),
    value: Number(p.value) || 0,
  }));
  if (points.length === 0) throw new Error('gdelt: empty volume timeline');

  const vol24h = points.filter((p) => p.ts >= now - 24 * 3600_000).reduce((a, p) => a + p.value, 0);
  // per-UTC-day sums → median of complete days
  /** @type {Record<string, number>} */
  const byDay = {};
  for (const p of points) {
    const day = new Date(p.ts).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + p.value;
  }
  const today = new Date(now).toISOString().slice(0, 10);
  const dailySums = Object.entries(byDay).filter(([d]) => d !== today).map(([, v]) => v).sort((a, b) => a - b);
  const median30d = dailySums.length
    ? dailySums[Math.floor(dailySums.length / 2)]
    : 0;

  putSeries('gdelt_vol24h', now, vol24h);
  putSeries('gdelt_median30d', now, median30d);
  bus.emit('metric', { metric: 'gdelt_vol24h', ts: now, value: vol24h });

  // 2) average tone of the last 24h of coverage
  await sleep(GDELT.spacingMs);
  try {
    const tone = await docQuery('mode=timelinetone&timespan=2d');
    const tonePoints = (tone.timeline?.[0]?.data || [])
      .map((p) => ({ ts: parseGdeltDate(p.date), value: Number(p.value) }))
      .filter((p) => Number.isFinite(p.value) && p.ts >= now - 24 * 3600_000);
    if (tonePoints.length) {
      const avg = tonePoints.reduce((a, p) => a + p.value, 0) / tonePoints.length;
      putSeries('gdelt_tone', now, avg);
      bus.emit('metric', { metric: 'gdelt_tone', ts: now, value: avg });
    }
  } catch (err) {
    console.warn('[gdelt] tone fetch failed (volume succeeded):', err instanceof Error ? err.message : err);
  }

  // 3) recent headlines
  await sleep(GDELT.spacingMs);
  try {
    const art = await docQuery(`mode=artlist&maxrecords=${GDELT.headlineCount}&sort=datedesc`);
    for (const a of art.articles || []) {
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
  } catch (err) {
    console.warn('[gdelt] headlines fetch failed (volume succeeded):', err instanceof Error ? err.message : err);
  }
}
