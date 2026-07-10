// panels/layers.ts — left panel "Live layers" status card: one row per data
// layer (Ships, Flights, News, Markets) with a status dot + summary numbers,
// so a visitor can see at a glance which feeds are live vs degraded vs off,
// instead of an empty section silently reading as "nothing is happening".
import type { AppState } from '../types';
import { t, fmtNum } from '../i18n';

type DotStatus = 'good' | 'warning' | 'serious' | 'muted';

interface LayerRow {
  key: string;
  status: DotStatus;
  nums: string;
  detail: string;
}

// Freshness thresholds are deliberately looser than each poller's own cadence
// (config.js pollMs) so a single missed cycle doesn't flip the dot to amber.
const NEWS_FRESH_MS = 3 * 3600_000; // matches server HPI.stalenessMs.N
const MARKETS_FRESH_MS = 90 * 60_000; // brent_quote polls hourly
const FLIGHTS_FRESH_MS = 10 * 60_000; // opensky polls every 2 min, 5-run cooldown

let state: AppState;
const vessels = new Map<number, true>();
let transitsToday = { in: 0, out: 0 };
let flightsCount = 0;
let flightsTs = 0;
let headlinesCount = 0;

export function init(s: AppState): void {
  state = s;
  transitsToday = { ...s.transitsToday };
  for (const v of s.vessels) vessels.set(v.mmsi, true);
  flightsCount = s.flights?.aircraft?.length ?? 0;
  flightsTs = s.flights?.ts ?? 0;
  headlinesCount = s.headlines.length;
  render();
  setInterval(render, 60_000);
}

export function onVessels(delta: { upsert?: { mmsi: number }[]; remove?: number[] }): void {
  for (const v of delta.upsert ?? []) vessels.set(v.mmsi, true);
  for (const mmsi of delta.remove ?? []) vessels.delete(mmsi);
  render();
}

export function onTransit(tr: { dir: 'in' | 'out' }): void {
  transitsToday[tr.dir]++;
  render();
}

export function onMetric(m: { metric: string; ts: number; value: number }): void {
  if (m.metric === 'gdelt_vol24h') state.metrics.gdelt_vol24h = { ts: m.ts, value: m.value };
  else if (m.metric === 'brent_intraday') state.metrics.brent_intraday = { ts: m.ts, value: m.value };
  else return;
  render();
}

export function onHeadline(): void {
  headlinesCount++;
  render();
}

export function onFlights(data: { ts: number; aircraft: unknown[] }): void {
  flightsCount = data.aircraft.length;
  flightsTs = data.ts;
  render();
}

function ageLabel(ts: number | null | undefined): string {
  if (!ts) return t('layers.never');
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return t('layers.justNow');
  if (mins < 60) return t('layers.ageMin', { m: mins });
  return t('layers.ageHr', { h: Math.round(mins / 60) });
}

function shipsRow(): LayerRow {
  const ais = state.ais;
  let status: DotStatus;
  let detail: string;
  if (ais.disabled) {
    status = 'muted'; detail = t('ais.disabled');
  } else if (ais.connected && !ais.streaming) {
    status = 'serious'; detail = t('layers.shipsDark');
  } else if (ais.streaming) {
    status = 'good'; detail = t('layers.live');
  } else {
    status = 'warning'; detail = t('ais.reconnecting');
  }
  const u = state.uniqueLargeToday;
  const nums = t('layers.shipsNums', {
    n: vessels.size,
    in: transitsToday.in,
    out: transitsToday.out,
    u: u.tankers + u.cargo,
  });
  return { key: 'ships', status, nums, detail };
}

function flightsRow(): LayerRow {
  const job = state.jobs.opensky;
  if (!job) return { key: 'flights', status: 'muted', nums: '–', detail: t('layers.flightsOff') };

  const ts = flightsTs || job.lastSuccess || 0;
  const fresh = ts && Date.now() - ts < FLIGHTS_FRESH_MS;
  const status: DotStatus = fresh ? 'good' : job.lastSuccess ? 'warning' : 'serious';
  const detail = fresh ? t('layers.live') : t('layers.degraded');
  const nums = t('layers.flightsNums', { n: flightsCount, age: ageLabel(ts) });
  return { key: 'flights', status, nums, detail };
}

function newsRow(): LayerRow {
  const vol = state.metrics.gdelt_vol24h;
  const fresh = vol && Date.now() - vol.ts < NEWS_FRESH_MS;
  const status: DotStatus = fresh ? 'good' : 'warning';
  const detail = fresh ? t('layers.live') : t('layers.newsBlocked');
  const nums = vol
    ? t('layers.newsNums', { n: fmtNum(vol.value, 0), h: headlinesCount })
    : t('layers.newsNumsEmpty', { h: headlinesCount });
  return { key: 'news', status, nums, detail };
}

function marketsRow(): LayerRow {
  const px = state.metrics.brent_intraday ?? state.metrics.brent_usd;
  if (!px) return { key: 'markets', status: 'muted', nums: '–', detail: t('layers.degraded') };
  const fresh = Date.now() - px.ts < MARKETS_FRESH_MS;
  const status: DotStatus = fresh ? 'good' : 'warning';
  const detail = fresh ? t('layers.live') : t('layers.degraded');
  const nums = t('layers.marketsNums', { price: fmtNum(px.value, 2), age: ageLabel(px.ts) });
  return { key: 'markets', status, nums, detail };
}

function render(): void {
  const rows = [shipsRow(), flightsRow(), newsRow(), marketsRow()];
  const ul = document.getElementById('layers-list')!;
  ul.innerHTML = rows
    .map(
      (r) => `<li class="layer-row">
        <span class="layer-dot dot-${r.status}"></span>
        <div class="layer-body">
          <div class="layer-name">${t('layers.' + r.key)}</div>
          <div class="layer-nums">${r.nums}</div>
          <div class="layer-detail">${r.detail}</div>
        </div>
      </li>`,
    )
    .join('');
}
