// panels/hilkka.ts — the "Hilkka & Suomi" drawer: plain-language costs for an
// average Finnish household, plus national fast proxies. All arithmetic is
// server-side (/api/hilkka); this file only formats and translates.
import { t, fmtNum, fmtDate } from '../i18n';

interface HilkkaData {
  persona: { tankLiters: number; kmPerMonth: number; litersPer100km: number; kwhPerMonth: number; preCrisisMonth: string };
  fuel: {
    e95: number | null; diesel: number | null; heatoil: number | null;
    e95Pre: number | null; dieselPre: number | null; heatoilPre: number | null;
    dataMonthTs: number | null;
    tankExtraEur: number | null; monthlyDrivingExtraEur: number | null; dieselTankExtraEur: number | null;
  };
  electricity: { nowCkwh: number | null; todayAvgCkwh: number | null; avg30dCkwh: number | null; monthlyCostEur: number | null };
  brent: { now: number | null; preCrisisAvg: number | null; pct: number | null };
  national: {
    nestePct30d: number | null; finnairPct30d: number | null;
    eurusd: number | null; cpiYoy: { ts: number; value: number } | null;
  };
}

const REFRESH_METRICS = new Set(['pump_e95', 'elec_spot', 'stock_neste', 'stock_finnair', 'eurusd', 'fi_cpi_yoy']);
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export async function init(): Promise<void> {
  const tab = document.getElementById('hilkka-tab')!;
  const drawer = document.getElementById('hilkka-drawer')!;
  tab.addEventListener('click', () => {
    const open = drawer.hasAttribute('hidden');
    drawer.toggleAttribute('hidden', !open);
    tab.setAttribute('aria-expanded', String(open));
  });
  await refresh();
}

export function onMetric(m: { metric: string }): void {
  if (!REFRESH_METRICS.has(m.metric)) return;
  // several metrics can arrive in a burst — coalesce into one refetch
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { refresh().catch(() => {}); }, 3000);
}

async function refresh(): Promise<void> {
  const res = await fetch('/api/hilkka');
  if (!res.ok) return;
  const d: HilkkaData = await res.json();
  renderLines(d);
  renderTiles(d);
}

function eur(v: number, digits = 2): string {
  return `${v >= 0 ? '+' : '−'}${fmtNum(Math.abs(v), digits)}`;
}

function costSpan(v: number, digits = 2, unit = '€'): string {
  const cls = v >= 0 ? 'cost-up' : 'cost-down';
  return `<span class="${cls}">${eur(v, digits)} ${unit}</span>`;
}

function renderLines(d: HilkkaData): void {
  const ul = document.getElementById('hilkka-lines')!;
  const lines: string[] = [];
  const f = d.fuel;

  if (f.e95 !== null && f.tankExtraEur !== null) {
    lines.push(t('hilkka.tank', {
      price: fmtNum(f.e95, 2),
      liters: d.persona.tankLiters,
      delta: costSpan(f.tankExtraEur),
    }));
  }
  if (f.monthlyDrivingExtraEur !== null) {
    lines.push(t('hilkka.driving', {
      km: fmtNum(d.persona.kmPerMonth, 0),
      delta: costSpan(f.monthlyDrivingExtraEur),
    }));
  }
  if (f.diesel !== null && f.dieselTankExtraEur !== null) {
    lines.push(t('hilkka.diesel', {
      price: fmtNum(f.diesel, 2),
      delta: costSpan(f.dieselTankExtraEur),
    }));
  }
  if (d.electricity.nowCkwh !== null) {
    lines.push(t('hilkka.elec', {
      now: fmtNum(d.electricity.nowCkwh, 1),
      avg: d.electricity.avg30dCkwh !== null ? fmtNum(d.electricity.avg30dCkwh, 1) : '…',
    }));
  }
  if (d.brent.pct !== null) {
    lines.push(t('hilkka.brent', {
      pct: `${d.brent.pct >= 0 ? '+' : ''}${fmtNum(d.brent.pct, 0)}`,
    }));
  }
  ul.innerHTML = lines.length
    ? lines.map((l) => `<li>${l}</li>`).join('')
    : `<li class="muted">${t('status.noData')}</li>`;

  document.getElementById('hilkka-persona')!.textContent = t('hilkka.persona', {
    liters: d.persona.litersPer100km,
    km: fmtNum(d.persona.kmPerMonth, 0),
    month: f.dataMonthTs ? fmtDate(f.dataMonthTs) : '…',
  });
}

function renderTiles(d: HilkkaData): void {
  const el = document.getElementById('suomi-tiles')!;
  const pct = (v: number | null) =>
    v === null ? '–' : `${v >= 0 ? '+' : ''}${fmtNum(v, 1)} %`;
  const tiles: Array<[string, string]> = [
    [pct(d.national.nestePct30d), t('suomi.neste')],
    [pct(d.national.finnairPct30d), t('suomi.finnair')],
    [d.national.eurusd !== null ? fmtNum(d.national.eurusd, 4) : '–', t('suomi.eurusd')],
    [
      d.national.cpiYoy ? `${fmtNum(d.national.cpiYoy.value, 1)} %` : '–',
      t('suomi.cpi', { month: d.national.cpiYoy ? fmtDate(d.national.cpiYoy.ts) : '…' }),
    ],
  ];
  el.innerHTML = tiles
    .map(([num, lbl]) => `<div class="counter"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`)
    .join('');
}
