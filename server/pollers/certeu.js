// @ts-check
// certeu.js — CERT-EU security-advisories RSS, an optional third
// infra_advisory source. Logged as headlines, not scored — see config.js's
// CERTEU block for rationale.
import { CERTEU } from '../config.js';
import { putHeadline } from '../db.js';
import { parseRssItems } from './rss.js';

export async function pollCertEu() {
  const res = await fetch(CERTEU.feedUrl, {
    headers: { 'User-Agent': CERTEU.userAgent },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`certeu ${res.status}`);
  const xml = await res.text();
  const items = parseRssItems(xml);
  for (const item of items) {
    putHeadline({ ts: item.ts, title: item.title, url: item.url, source: 'CERT-EU', tone: null }, CERTEU.module);
  }
  return items.length;
}
