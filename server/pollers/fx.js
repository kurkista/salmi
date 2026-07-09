// @ts-check
// fx.js — ECB reference rate, USD per EUR. Oil is priced in dollars; a weaker
// euro makes the same barrel more expensive at a Finnish pump.
import { FX } from '../config.js';
import { putSeries, latestSeries } from '../db.js';
import { bus } from '../bus.js';

export async function pollFx() {
  const res = await fetch(FX.url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ecb ${res.status}`);
  const csv = await res.text();
  const lines = csv.trim().split('\n');
  const header = lines[0].split(',');
  const timeIdx = header.indexOf('TIME_PERIOD');
  const valueIdx = header.indexOf('OBS_VALUE');
  if (timeIdx === -1 || valueIdx === -1) throw new Error('ecb: unexpected CSV header');
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const ts = Date.parse(cols[timeIdx]);
    const v = Number(cols[valueIdx]);
    if (Number.isFinite(ts) && Number.isFinite(v)) putSeries('eurusd', ts, v);
  }
  const latest = latestSeries('eurusd');
  if (latest) bus.emit('metric', { metric: 'eurusd', ...latest });
}
