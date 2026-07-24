// @ts-check
// euvd.js — ENISA EUVD (European Union Vulnerability Database) JSON API,
// domain 4's second independent EU-level source. Logged as headlines under
// module 'infra_advisory', not scored — see config.js's EUVD block for
// rationale. Schema confirmed live 2026-07-24 via direct curl against
// euvdservices.enisa.europa.eu — fields used below are real, not guessed.
import { EUVD } from '../config.js';
import { putHeadline } from '../db.js';

export async function pollEuvd() {
  const res = await fetch(EUVD.apiUrl, {
    headers: { 'User-Agent': EUVD.userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`euvd ${res.status}`);
  /** @type {any[]} */
  const records = await res.json();
  let stored = 0;
  for (const r of records) {
    if (!r?.id) continue;
    const ts = r.datePublished ? Date.parse(r.datePublished) : NaN;
    const firstRef = String(r.references || '').split('\n').map((s) => s.trim()).find(Boolean);
    const alias = String(r.aliases || '').split('\n').map((s) => s.trim()).find(Boolean);
    const title = `${r.id}${alias ? ` (${alias})` : ''}: ${String(r.description || '').slice(0, 140)}`;
    putHeadline(
      { ts: Number.isFinite(ts) ? ts : Date.now(), title, url: firstRef || `https://euvd.enisa.europa.eu/vulnerability/${r.id}`, source: 'ENISA EUVD', tone: null },
      EUVD.module
    );
    stored++;
  }
  return stored;
}
