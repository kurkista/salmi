// panels/timeline.ts — consolidated timeline: every metric we hold real
// history for, overlaid on one shared 0–100 normalized index so wildly
// different units (index points, dollars, counts, percent) can be compared
// at a glance. Hover any line for its real value and unit; click a legend
// item to hide/show a series. Dashed markers are the same hand-curated
// events used on the Brent chart.
import type { AppState, HormuzEvent } from '../types';
import { t, getLang, fmtNum } from '../i18n';
import { getSeries } from '../api';
import { makeUnifiedTimeline, type UnifiedTimelineRow } from '../charts';

const METRICS: { metric: string; labelKey: string; color: string; scale?: (v: number) => number; fmt: (v: number) => string }[] = [
  { metric: 'hpi', labelKey: 'timeline.hpi', color: '#3987e5', fmt: (v) => fmtNum(v, 0) },
  { metric: 'brent_usd', labelKey: 'timeline.brent', color: '#c98500', fmt: (v) => `$${fmtNum(v, 2)}` },
  { metric: 'pw_total', labelKey: 'timeline.transits', color: '#0ca30c', fmt: (v) => `${fmtNum(v, 0)}/day` },
  { metric: 'gdelt_vol24h', labelKey: 'timeline.news', color: '#ec835a', fmt: (v) => fmtNum(v, 0) },
  { metric: 'poly_p', labelKey: 'timeline.odds', color: '#fab219', scale: (v) => v * 100, fmt: (v) => `${fmtNum(v, 1)} %` },
  { metric: 'vessels_in_strait', labelKey: 'timeline.ships', color: '#9085e9', fmt: (v) => fmtNum(v, 0) },
  { metric: 'flights_count', labelKey: 'timeline.flights', color: '#4fd1c5', fmt: (v) => fmtNum(v, 0) },
];

let chart: ReturnType<typeof makeUnifiedTimeline> | null = null;
let events: HormuzEvent[] = [];
let loaded = false;

export function init(state: AppState): void {
  events = state.events;
  const tab = document.getElementById('timeline-tab')!;
  const drawer = document.getElementById('timeline-drawer')!;

  tab.addEventListener('click', async () => {
    const opening = drawer.hasAttribute('hidden');
    closeDrawer('hilkka-drawer', 'hilkka-tab');
    drawer.toggleAttribute('hidden', !opening);
    tab.setAttribute('aria-expanded', String(opening));
    if (opening) {
      if (!loaded) { await renderChart(); loaded = true; }
      else chart?.resize();
    }
  });
}

/** Exported so other bottom-tab drawers (Kerttu & Suomi) can close this one when they open. */
export function closeDrawer(id = 'timeline-drawer', tabId = 'timeline-tab'): void {
  const el = document.getElementById(id);
  const tabEl = document.getElementById(tabId);
  if (el && !el.hasAttribute('hidden')) {
    el.setAttribute('hidden', '');
    tabEl?.setAttribute('aria-expanded', 'false');
  }
}

async function renderChart(): Promise<void> {
  const el = document.getElementById('timeline-chart')!;
  const rows = await Promise.all(
    METRICS.map(async (m) => {
      const raw = await getSeries(m.metric, 30).catch(() => []);
      const points = m.scale ? raw.map(([ts, v]) => [ts, m.scale!(v)] as [number, number]) : raw;
      return { label: t(m.labelKey), color: m.color, points, fmt: m.fmt } satisfies UnifiedTimelineRow;
    }),
  );
  chart?.dispose();
  chart = makeUnifiedTimeline(el, rows, events, getLang());
  window.addEventListener('resize', () => chart?.resize(), { passive: true });
}
