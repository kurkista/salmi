// @ts-check
// portwatch.js — official daily transit calls for the Strait of Hormuz from
// IMF PortWatch (ArcGIS FeatureServer, free). Publishes with ~4 days' lag.
// This is the same source Polymarket uses to resolve its Hormuz markets, and
// it feeds the HPI transit component (7-day moving average vs 2025 baseline).
import { PORTWATCH } from '../config.js';
import { putSeries } from '../db.js';
import { bus } from '../bus.js';

export async function pollPortwatch() {
  const since = new Date(Date.now() - PORTWATCH.fetchDays * 24 * 3600_000)
    .toISOString().slice(0, 10);
  const params = new URLSearchParams({
    where: `portid='${PORTWATCH.portid}' AND date >= DATE '${since}'`,
    outFields: 'date,n_total,n_tanker,n_cargo',
    orderByFields: 'date ASC',
    resultRecordCount: '400',
    f: 'json',
  });
  const res = await fetch(`${PORTWATCH.queryUrl}?${params}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`portwatch ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`portwatch: ${JSON.stringify(data.error)}`);
  const rows = (data.features || []).map((f) => f.attributes);
  if (rows.length === 0) throw new Error('portwatch: no rows');

  for (const r of rows) {
    // ArcGIS returns epoch-ms dates; normalize to the UTC date
    const ts = Date.parse(new Date(r.date).toISOString().slice(0, 10));
    putSeries('pw_total', ts, r.n_total ?? 0);
    putSeries('pw_tanker', ts, r.n_tanker ?? 0);
    putSeries('pw_cargo', ts, r.n_cargo ?? 0);
  }

  // 7-day moving average over the last 7 *published* days, stamped with the
  // latest data date (so HPI staleness reflects the publication lag, not our
  // poll time).
  const last7 = rows.slice(-7);
  const avg = last7.reduce((a, r) => a + (r.n_total ?? 0), 0) / last7.length;
  const lastTs = Date.parse(new Date(rows[rows.length - 1].date).toISOString().slice(0, 10));
  putSeries('pw_7dma', lastTs, avg);
  bus.emit('metric', { metric: 'pw_7dma', ts: lastTs, value: avg });
}
