// @ts-check
// stocks.js — Hormuz-sensitive Helsinki tickers (Neste, Finnair), daily closes.
// Fast national proxies: they reprice strait news within minutes, unlike CPI.
import { STOCKS } from '../config.js';
import { putSeries, latestSeries } from '../db.js';
import { bus } from '../bus.js';
import { yahooChart, dailyCloses } from './yahoo.js';

export async function pollStocks() {
  let firstError = null;
  for (const [metric, symbol] of Object.entries(STOCKS.symbols)) {
    try {
      const r = await yahooChart(symbol, 'range=3mo&interval=1d');
      for (const [ts, v] of dailyCloses(r)) putSeries(metric, ts, v);
      // today's running price, keyed to today's date row
      const price = r.meta?.regularMarketPrice;
      if (typeof price === 'number') {
        putSeries(metric, Date.parse(new Date().toISOString().slice(0, 10)), price);
      }
      const latest = latestSeries(metric);
      if (latest) bus.emit('metric', { metric, ...latest });
    } catch (err) {
      firstError ??= err;
      console.warn(`[stocks] ${symbol} failed:`, err instanceof Error ? err.message : err);
    }
  }
  if (firstError) throw firstError; // surface partial failure as job staleness
}
