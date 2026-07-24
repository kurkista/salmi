// @ts-check
// fingrid.js — Fingrid Open Data traffic-light incident indicators: "power
// system state" (dataset 209) and "electricity shortage status" (dataset
// 336), Fingrid's own incident/anomaly assessments, not raw series needing
// custom anomaly detection. See config.js's FINGRID block for verification
// notes. Logged as series only — not scored into the infra index, same
// "shown, not scored" treatment as the other domain 4 advisory sources,
// until there's an honest way to fold a 1..5 traffic-light state into the
// weighted formula.
import { FINGRID } from '../config.js';
import { putSeries } from '../db.js';

async function fetchLatest(datasetId) {
  const res = await fetch(`${FINGRID.apiBase}/${datasetId}/data/latest`, {
    headers: { 'x-api-key': FINGRID.apiKey },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`fingrid dataset ${datasetId}: ${res.status}`);
  const json = await res.json();
  if (!Number.isFinite(json?.value)) throw new Error(`fingrid dataset ${datasetId}: no numeric value in response`);
  return json.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function pollFingridState() {
  if (!FINGRID.apiKey) return; // disabled until FINGRID_API_KEY is set — see config.js
  // Sequential, not Promise.all: the free tier rate-limits concurrent
  // requests (confirmed 429 when fired together during verification).
  const state = await fetchLatest(FINGRID.datasets.powerSystemState);
  await sleep(2_000);
  const shortage = await fetchLatest(FINGRID.datasets.electricityShortageStatus);
  const now = Date.now();
  putSeries('fingrid_power_system_state', now, state);
  putSeries('fingrid_electricity_shortage_status', now, shortage);
}
