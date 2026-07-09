// @ts-check
// pump.js — Finnish pump prices (E95, diesel, light fuel oil, €/L incl. taxes)
// from Statistics Finland PxWeb table 11xx: official monthly averages back to
// 2002. Monthly granularity beats scraping weekly HTML: it's the series the
// pre-crisis reference (2026-02) comes from.
import { STATFIN } from '../config.js';
import { putSeries, latestSeries } from '../db.js';
import { bus } from '../bus.js';

export async function pollPump() {
  const codes = Object.values(STATFIN.fuelCodes);
  const res = await fetch(STATFIN.fuelUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      query: [
        { code: 'coicop_13_20160512', selection: { filter: 'item', values: codes } },
        { code: 'timeperiod_m', selection: { filter: 'top', values: ['60'] } },
      ],
      response: { format: 'json-stat2' },
    }),
  });
  if (!res.ok) throw new Error(`statfin fuel ${res.status}`);
  const data = await res.json();

  // json-stat2: value[] is laid out by d.size in d.id order (month, fuel, info)
  const months = Object.keys(data.dimension.timeperiod_m.category.index);
  const fuels = Object.keys(data.dimension.coicop_13_20160512.category.index);
  const values = data.value;
  const metricByCode = Object.fromEntries(Object.entries(STATFIN.fuelCodes).map(([m, c]) => [c, m]));

  for (let mi = 0; mi < months.length; mi++) {
    const ts = Date.parse(months[mi].replace('M', '-') + '-01');
    for (let fi = 0; fi < fuels.length; fi++) {
      const v = values[mi * fuels.length + fi];
      if (typeof v === 'number') putSeries(metricByCode[fuels[fi]], ts, v);
    }
  }
  const latest = latestSeries('pump_e95');
  if (latest) bus.emit('metric', { metric: 'pump_e95', ...latest });
}
