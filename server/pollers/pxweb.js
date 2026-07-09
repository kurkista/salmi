// @ts-check
// pxweb.js — Finnish CPI annual change (inflation, %) from Statistics Finland
// PxWeb table 122p. The honest "slow" national indicator: strait effects take
// months to reach it, and many other things move it too.
import { STATFIN } from '../config.js';
import { putSeries } from '../db.js';
import { bus } from '../bus.js';

export async function pollCpi() {
  const res = await fetch(STATFIN.cpiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      query: [
        { code: 'timeperiod_m', selection: { filter: 'top', values: ['24'] } },
      ],
      response: { format: 'json-stat2' },
    }),
  });
  if (!res.ok) throw new Error(`statfin cpi ${res.status}`);
  const data = await res.json();
  const months = Object.keys(data.dimension.timeperiod_m.category.index);
  for (let i = 0; i < months.length; i++) {
    const v = data.value[i];
    if (typeof v === 'number') {
      putSeries('fi_cpi_yoy', Date.parse(months[i].replace('M', '-') + '-01'), v);
    }
  }
  const lastTs = Date.parse(months[months.length - 1].replace('M', '-') + '-01');
  bus.emit('metric', { metric: 'fi_cpi_yoy', ts: lastTs, value: data.value[months.length - 1] });
}
