// @ts-check
// hilkka.js — translates the strait situation into everyday Finnish euros.
// All persona constants live in config.js (HILKKA) and are returned with the
// numbers so the UI can show its work. Server-side so the arithmetic has one
// home; the frontend only formats.
import { HILKKA } from './config.js';
import { latestSeries, seriesSince } from './db.js';

/** value of a monthly series at the pre-crisis reference month */
function atMonth(metric, month) {
  const ts = Date.parse(`${month}-01`);
  const rows = seriesSince(metric, ts - 24 * 3600_000);
  const row = rows.find((r) => r.ts === ts);
  return row?.value ?? null;
}

function avgSince(metric, sinceTs, untilTs = Infinity) {
  const rows = seriesSince(metric, sinceTs).filter((r) => r.ts <= untilTs);
  if (rows.length === 0) return null;
  return rows.reduce((a, r) => a + r.value, 0) / rows.length;
}

export function computeHilkka(now = Date.now()) {
  const e95 = latestSeries('pump_e95');
  const diesel = latestSeries('pump_diesel');
  const heatoil = latestSeries('pump_heatoil');
  const e95Pre = atMonth('pump_e95', HILKKA.preCrisisMonth);
  const dieselPre = atMonth('pump_diesel', HILKKA.preCrisisMonth);
  const heatoilPre = atMonth('pump_heatoil', HILKKA.preCrisisMonth);

  // fuel deltas (€/L) vs the pre-crisis month
  const dE95 = e95 && e95Pre !== null ? e95.value - e95Pre : null;
  const dDiesel = diesel && dieselPre !== null ? diesel.value - dieselPre : null;

  // Brent now vs the pre-crisis month's average
  const preStart = Date.parse(`${HILKKA.preCrisisMonth}-01`);
  const preEnd = preStart + 28 * 24 * 3600_000;
  const brentPre = avgSince('brent_usd', preStart, preEnd);
  const brentNow = latestSeries('brent_intraday') ?? latestSeries('brent_usd');

  // electricity: current spot + averages (no pre-crisis claim — the causal
  // link is weak in Finland and our history only accumulates from deploy day)
  const nowRows = seriesSince('elec_spot', now - 3 * 3600_000).filter((r) => r.ts <= now);
  const elecNow = nowRows.at(-1)?.value ?? null;
  const elecToday = avgSince('elec_spot', Date.parse(new Date(now).toISOString().slice(0, 10)), now);
  const elec30d = avgSince('elec_spot', now - 30 * 24 * 3600_000, now);

  // national fast proxies: 30-day change
  const pct30d = (metric) => {
    const rows = seriesSince(metric, now - 40 * 24 * 3600_000);
    if (rows.length < 2) return null;
    const first = rows[0].value;
    const last = rows[rows.length - 1].value;
    return first > 0 ? ((last - first) / first) * 100 : null;
  };

  return {
    persona: HILKKA,
    fuel: {
      e95: e95?.value ?? null,
      diesel: diesel?.value ?? null,
      heatoil: heatoil?.value ?? null,
      e95Pre, dieselPre, heatoilPre,
      dataMonthTs: e95?.ts ?? null,
      // the headline translations
      tankExtraEur: dE95 !== null ? dE95 * HILKKA.tankLiters : null,
      monthlyDrivingExtraEur:
        dE95 !== null ? dE95 * (HILKKA.kmPerMonth / 100) * HILKKA.litersPer100km : null,
      dieselTankExtraEur: dDiesel !== null ? dDiesel * HILKKA.tankLiters : null,
    },
    electricity: {
      nowCkwh: elecNow,
      todayAvgCkwh: elecToday,
      avg30dCkwh: elec30d,
      monthlyCostEur: elecNow !== null && elec30d !== null
        ? (elec30d / 100) * HILKKA.kwhPerMonth
        : null,
    },
    brent: {
      now: brentNow?.value ?? null,
      preCrisisAvg: brentPre,
      pct: brentNow && brentPre ? ((brentNow.value - brentPre) / brentPre) * 100 : null,
    },
    national: {
      nestePct30d: pct30d('stock_neste'),
      finnairPct30d: pct30d('stock_finnair'),
      eurusd: latestSeries('eurusd')?.value ?? null,
      cpiYoy: latestSeries('fi_cpi_yoy'),
    },
    ts: now,
  };
}
