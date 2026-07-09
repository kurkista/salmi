// @ts-check
// brent.js — Brent crude prices. Yahoo Finance's chart API is the primary
// source (unofficial but rich); FRED's CSV export (DCOILBRENTEU, few days'
// lag) is the fallback and long-history backbone. Both are free, no key.
import { BRENT } from '../config.js';
import { putSeries, seriesSince, latestSeries } from '../db.js';
import { bus } from '../bus.js';
import { yahooChart, dailyCloses } from './yahoo.js';

/** Daily close history (~1y) + recompute realized volatility. */
export async function pollBrentHistory() {
  try {
    const r = await yahooChart(BRENT.yahooSymbol, 'range=1y&interval=1d');
    for (const [ts, v] of dailyCloses(r)) putSeries('brent_usd', ts, v);
  } catch (err) {
    console.warn('[brent] yahoo history failed, trying FRED:', err instanceof Error ? err.message : err);
    await fredHistory();
  }
  computeVolatility();
  const latest = latestSeries('brent_usd');
  if (latest) bus.emit('metric', { metric: 'brent_usd', ...latest });
}

async function fredHistory() {
  const res = await fetch(BRENT.fredCsvUrl, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`fred ${res.status}`);
  const csv = await res.text();
  for (const line of csv.split('\n').slice(1)) {
    const [date, value] = line.trim().split(',');
    const v = Number(value);
    if (date && Number.isFinite(v)) putSeries('brent_usd', Date.parse(date), v);
  }
}

/** Latest tradable price, hourly. Decoration — daily closes are the backbone. */
export async function pollBrentQuote() {
  const r = await yahooChart(BRENT.yahooSymbol, 'range=1d&interval=15m');
  const price = r.meta?.regularMarketPrice;
  const t = r.meta?.regularMarketTime;
  if (typeof price !== 'number') throw new Error('yahoo: no regularMarketPrice');
  const ts = typeof t === 'number' ? t * 1000 : Date.now();
  putSeries('brent_intraday', ts, price);
  bus.emit('metric', { metric: 'brent_intraday', ts, value: price });
}

/**
 * 20-day realized volatility, annualized (√252), from daily log returns.
 * Feeds the HPI "oil stress" component.
 */
export function computeVolatility() {
  const days = BRENT.volatilityWindowDays;
  const rows = seriesSince('brent_usd', Date.now() - 120 * 24 * 3600_000);
  if (rows.length < days + 1) return;
  const closes = rows.slice(-(days + 1)).map((r) => r.value);
  const returns = [];
  for (let i = 1; i < closes.length; i++) returns.push(Math.log(closes[i] / closes[i - 1]));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
  const sigma = Math.sqrt(variance) * Math.sqrt(252);
  const ts = rows[rows.length - 1].ts;
  putSeries('brent_sigma20', ts, sigma);
  bus.emit('metric', { metric: 'brent_sigma20', ts, value: sigma });
}
