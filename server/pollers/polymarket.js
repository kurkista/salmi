// @ts-check
// polymarket.js — crowd odds from Polymarket's public Gamma API (no auth).
// The configured market's semantics ('normal' vs 'closed') are applied in
// hpi.js; here we only store p(yes) of the first live configured market.
import { POLYMARKET } from '../config.js';
import { putSeries } from '../db.js';
import { bus } from '../bus.js';

export async function pollPolymarket() {
  for (const market of POLYMARKET.markets) {
    const url = `${POLYMARKET.gammaUrl}/markets?slug=${encodeURIComponent(market.slug)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`gamma ${res.status}`);
    const list = await res.json();
    const m = Array.isArray(list) ? list[0] : null;
    if (!m) throw new Error(`gamma: market not found: ${market.slug}`);
    if (m.closed || !m.active) {
      // Markets are date-bounded and rotate. This needs a human: pick the
      // successor market on polymarket.com and update POLYMARKET.markets.
      console.warn(
        `[polymarket] ⚠ market RESOLVED/inactive: ${market.slug} — ` +
        'update POLYMARKET.markets in server/config.js (see README). ' +
        'HPI will drop the P component until then.'
      );
      continue;
    }
    const p = Number(JSON.parse(m.outcomePrices)[0]);
    if (!Number.isFinite(p)) throw new Error('gamma: unparseable outcomePrices');
    const ts = Date.now();
    putSeries('poly_p', ts, p);
    bus.emit('metric', { metric: 'poly_p', ts, value: p });
    return;
  }
}
