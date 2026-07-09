// @ts-check
// electricity.js — Finnish spot electricity from api.porssisahko.net
// (c/kWh incl. VAT, 15-minute resolution, latest 48 h incl. tomorrow once
// published). Honest framing: Finland's power mix means the Hormuz link is
// weak — we chart it to *test* the correlation, not to assert it.
import { ELECTRICITY } from '../config.js';
import { putSeries, latestSeries } from '../db.js';
import { bus } from '../bus.js';

export async function pollElectricity() {
  const res = await fetch(ELECTRICITY.url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`porssisahko ${res.status}`);
  const data = await res.json();
  const prices = data?.prices;
  if (!Array.isArray(prices) || prices.length === 0) throw new Error('porssisahko: empty prices');
  for (const p of prices) {
    const ts = Date.parse(p.startDate);
    if (Number.isFinite(ts) && typeof p.price === 'number') putSeries('elec_spot', ts, p.price);
  }
  const now = latestSeries('elec_spot');
  if (now) bus.emit('metric', { metric: 'elec_spot', ...now });
}
