// panels/status.ts — left panel: band chip, HPI gauge + component breakdown,
// PortWatch transit sparkline, live counters, gate-crossing ticker.
import type * as echarts from 'echarts/core';
import type { AppState, HpiSnapshot } from '../types';
import { t, fmtTime, fmtDate, fmtNum } from '../i18n';
import { makeGauge, setGauge, makeSparkline, bindResize } from '../charts';
import { getTransits } from '../api';

const BASELINE = 91.5; // keep in sync with server/config.js HPI.baselineTransitsPerDay
const COMPONENT_KEYS = ['T', 'N', 'P', 'O'] as const;

let gauge: echarts.ECharts;
let transitsToday = { in: 0, out: 0 };
let state: AppState;

export async function init(s: AppState): Promise<void> {
  state = s;
  transitsToday = s.transitsToday;

  gauge = makeGauge(document.getElementById('hpi-gauge')!);
  renderHpi(s.hpi);
  renderCounters();

  if (s.ais.disabled) {
    const ticker = document.getElementById('ticker')!;
    ticker.innerHTML = `<li class="muted">${t('ais.disabled')}</li>`;
  }

  const transits = await getTransits(30);
  const spark = makeSparkline(document.getElementById('transit-spark')!, transits.portwatch, BASELINE);
  bindResize(gauge, spark);
}

export function onHpi(snapshot: HpiSnapshot): void {
  renderHpi(snapshot);
}

export function onTransit(tr: { ts: number; mmsi: number; name: string | null; dir: 'in' | 'out' }): void {
  transitsToday[tr.dir]++;
  renderCounters();
  const ticker = document.getElementById('ticker')!;
  ticker.querySelector('.muted')?.remove();
  const li = document.createElement('li');
  li.innerHTML =
    `<time>${fmtTime(tr.ts)}</time>` +
    `<span class="dir-${tr.dir}">${escapeHtml(tr.name ?? String(tr.mmsi))} ${t('ticker.' + tr.dir)}</span>`;
  ticker.prepend(li);
  while (ticker.children.length > 12) ticker.lastElementChild!.remove();
}

function renderHpi(snapshot: HpiSnapshot | null): void {
  const chip = document.getElementById('band-chip')!;
  const label = document.getElementById('band-label')!;
  chip.className = 'band-chip ' + (snapshot ? `band-${snapshot.band}` : 'band-none');
  label.textContent = snapshot
    ? `${t('band.' + snapshot.band)} · ${Math.round(snapshot.hpi)}`
    : t('status.warming');

  if (snapshot) setGauge(gauge, snapshot.hpi);

  const list = document.getElementById('hpi-components')!;
  list.innerHTML = '';
  for (const key of COMPONENT_KEYS) {
    const li = document.createElement('li');
    const c = snapshot?.components[key];
    if (c) {
      li.innerHTML = `<span>${t('comp.' + key)}</span><span class="val">${fmtNum(c.score, 0)}</span>`;
      li.title = JSON.stringify(c.raw);
    } else {
      li.innerHTML = `<span>${t('comp.' + key)}</span><span class="stale">${t('comp.stale')}</span>`;
    }
    list.appendChild(li);
  }
}

function renderCounters(): void {
  const el = document.getElementById('counters')!;
  const pw = state.metrics.pw_total;
  const u = state.uniqueLargeToday;
  const counters: Array<[string | number, string]> = [
    [state.vessels.length, t('counters.vesselsNow')],
    [`${transitsToday.in}/${transitsToday.out}`, t('counters.transitsToday')],
    [pw ? fmtNum(pw.value, 0) : '–', t('counters.pwLatest', { date: pw ? fmtDate(pw.ts) : '–' })],
    [u.tankers + u.cargo, t('counters.uniqueLarge')],
  ];
  el.innerHTML = counters
    .map(([num, lbl]) => `<div class="counter"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`)
    .join('');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
