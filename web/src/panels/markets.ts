// panels/markets.ts — right panel: Brent chart with event annotations,
// Polymarket odds chip, GDELT headlines feed.
import type * as echarts from 'echarts/core';
import type { AppState, Headline, SeriesData } from '../types';
import { t, getLang, fmtNum } from '../i18n';
import { makeBrentChart, updateBrentChart, bindResize } from '../charts';
import { getSeries } from '../api';

let brentChart: echarts.ECharts;
let daily: SeriesData = [];
let lastDailyClose: number | null = null;

export async function init(state: AppState): Promise<void> {
  daily = await getSeries('brent_usd', 60);
  lastDailyClose = daily.length >= 2 ? daily[daily.length - 2][1] : null;

  brentChart = makeBrentChart(document.getElementById('brent-chart')!, withIntraday(state), state.events, getLang());
  bindResize(brentChart);

  renderBigNum(state.metrics.brent_intraday?.value ?? daily.at(-1)?.[1] ?? null);
  renderOdds(state.metrics.poly_p?.value ?? null);
  renderNewsMeta(state.metrics.gdelt_vol24h?.value ?? null, state.metrics.gdelt_median30d?.value ?? null);

  const list = document.getElementById('headlines')!;
  list.innerHTML = '';
  for (const h of state.headlines) list.appendChild(headlineLi(h));
}

export function onMetric(m: { metric: string; ts: number; value: number }): void {
  if (m.metric === 'brent_intraday') {
    renderBigNum(m.value);
    updateBrentChart(brentChart, withIntraday(undefined, [m.ts, m.value]));
  } else if (m.metric === 'poly_p') {
    renderOdds(m.value);
  } else if (m.metric === 'gdelt_vol24h') {
    renderNewsMeta(m.value, null);
  }
}

export function onHeadline(h: Headline): void {
  const list = document.getElementById('headlines')!;
  list.prepend(headlineLi(h));
  while (list.children.length > 20) list.lastElementChild!.remove();
}

function withIntraday(state?: AppState, tick?: [number, number]): SeriesData {
  const intra = tick ?? (state?.metrics.brent_intraday
    ? [state.metrics.brent_intraday.ts, state.metrics.brent_intraday.value] as [number, number]
    : null);
  if (!intra || daily.length === 0) return daily;
  return intra[0] > daily[daily.length - 1][0] ? [...daily, intra] : daily;
}

function renderBigNum(price: number | null): void {
  const el = document.getElementById('brent-now')!;
  if (price === null) { el.textContent = '–'; return; }
  let deltaHtml = '';
  if (lastDailyClose !== null && lastDailyClose > 0) {
    const pct = ((price - lastDailyClose) / lastDailyClose) * 100;
    const cls = pct >= 0 ? 'delta-up' : 'delta-down'; // oil up = cost pressure
    deltaHtml = ` <span class="${cls}">${pct >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(pct), 1)}%</span>`;
  }
  el.innerHTML = `$${fmtNum(price, 2)}${deltaHtml}`;
}

function renderOdds(p: number | null): void {
  document.getElementById('poly-chip')!.textContent = p === null ? '–' : `${fmtNum(p * 100, 1)} %`;
}

function renderNewsMeta(vol: number | null, median: number | null): void {
  if (vol === null) return;
  const el = document.getElementById('news-meta')!;
  el.textContent = t('news.meta', {
    n: fmtNum(vol, 0),
    m: median !== null ? fmtNum(median, 0) : '…',
  });
}

function headlineLi(h: Headline): HTMLLIElement {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = h.url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = h.title;
  const src = document.createElement('span');
  src.className = 'src';
  src.textContent = `${h.source ?? ''} · ${new Date(h.ts).toLocaleString()}`;
  li.append(a, src);
  return li;
}
