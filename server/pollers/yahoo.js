// @ts-check
// yahoo.js — shared Yahoo Finance chart fetch (unofficial API; callers must
// have a fallback or tolerate staleness).
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) salmi-monitor/0.1';

/**
 * @param {string} symbol e.g. 'BZ=F', 'NESTE.HE'
 * @param {string} params e.g. 'range=1y&interval=1d'
 */
export async function yahooChart(symbol, params) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`yahoo ${symbol} ${res.status}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`yahoo ${symbol}: empty chart result`);
  return result;
}

/** Store daily closes normalized to UTC-date timestamps. */
export function dailyCloses(result) {
  const ts = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  /** @type {Array<[number, number]>} */
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    if (typeof closes[i] === 'number') {
      const day = new Date(ts[i] * 1000).toISOString().slice(0, 10);
      out.push([Date.parse(day), closes[i]]);
    }
  }
  return out;
}
