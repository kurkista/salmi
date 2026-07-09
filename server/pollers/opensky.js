// @ts-check
// opensky.js — live aircraft over the wider Gulf from the OpenSky Network
// (free registered account, OAuth2 client credentials). Flights are ephemeral
// context, not index input: kept in memory only, never in SQLite.
import { OPENSKY } from '../config.js';
import { bus } from '../bus.js';

let token = '';
let tokenExpiresAt = 0;
let cooldown = 0;
let warned = false;

const latest = { ts: 0, aircraft: /** @type {any[]} */ ([]) };

export function flightsSnapshot() {
  return latest;
}

async function getToken() {
  if (token && Date.now() < tokenExpiresAt - 60_000) return token;
  const res = await fetch(OPENSKY.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: OPENSKY.clientId,
      client_secret: OPENSKY.clientSecret,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`opensky token ${res.status}`);
  const data = await res.json();
  token = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in ?? 1800) * 1000;
  return token;
}

export async function pollOpenSky() {
  if (!OPENSKY.clientId || !OPENSKY.clientSecret) {
    if (!warned) {
      warned = true;
      console.warn('[opensky] OPENSKY_CLIENT_ID/SECRET not set — flight layer disabled.');
    }
    return;
  }
  if (cooldown > 0) { cooldown--; return; }

  const { lamin, lomin, lamax, lomax } = OPENSKY.bbox;
  const url = `${OPENSKY.statesUrl}?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${await getToken()}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429) {
    cooldown = OPENSKY.cooldownRuns;
    throw new Error('opensky 429 — cooling down');
  }
  if (!res.ok) throw new Error(`opensky ${res.status}`);
  const data = await res.json();

  // state vector indices: 0 icao24, 1 callsign, 5 lon, 6 lat, 7 baro alt (m),
  // 8 on_ground, 10 true_track
  latest.ts = (data.time ?? Math.floor(Date.now() / 1000)) * 1000;
  latest.aircraft = (data.states || [])
    .filter((s) => !s[8] && typeof s[5] === 'number' && typeof s[6] === 'number')
    .map((s) => ({
      icao: s[0],
      cs: (s[1] || '').trim() || null,
      lon: Math.round(s[5] * 1e4) / 1e4,
      lat: Math.round(s[6] * 1e4) / 1e4,
      alt: typeof s[7] === 'number' ? Math.round(s[7]) : null,
      trk: typeof s[10] === 'number' ? Math.round(s[10]) : null,
    }));
  bus.emit('flights', { ts: latest.ts, aircraft: latest.aircraft });
}
