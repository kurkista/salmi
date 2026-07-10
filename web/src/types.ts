export interface Vessel {
  mmsi: number;
  name: string | null;
  type: number | null;
  lat: number;
  lon: number;
  sog: number | null;
  cog: number | null;
  hdg: number | null;
  seen: number;
}

export interface Aircraft {
  icao: string;
  cs: string | null;
  lon: number;
  lat: number;
  alt: number | null;
  trk: number | null;
}

export interface IndexComponent {
  score: number;
  raw: Record<string, unknown>;
  ts: number;
}

/** Dormant Hormuz's index snapshot shape — kept for type completeness only; no longer surfaced live. */
export interface HpiSnapshot {
  ts: number;
  hpi: number;
  band: string;
  components: Record<string, IndexComponent>;
  used?: string[];
  version: string;
}

/** A generic index_snapshots row (nordic, infoenv) — field is `value`. */
export interface IndexSnapshot {
  ts: number;
  value: number;
  band: string;
  components: Record<string, IndexComponent>;
  version: string;
}

export interface MetricPoint {
  ts: number;
  value: number;
}

export interface Headline {
  ts: number;
  title: string;
  url: string;
  source: string | null;
  /** Only present on the SSE 'headline' event, not on /api/state's per-module lists. */
  module?: string;
}

export interface DomainEvent {
  ts: string;
  type: string;
  en: string;
  fi: string;
  url: string;
}

export interface AisStatus {
  disabled: boolean;
  connected: boolean;
  lastMsgTs: number | null;
  msgCount: number;
  streaming: boolean;
}

/** Domain 1: Nordic tension. No transitsToday — gate-crossing detection is
 * disabled (no chokepoint geometry in the open Baltic), so that field would
 * be a permanently-fabricated zero rather than an honest omission. */
export interface NordicModule {
  index: IndexSnapshot | null;
  vessels: Vessel[];
  uniqueLargeToday: { tankers: number; cargo: number };
  headlines: Headline[];
  events: DomainEvent[];
  flights: { ts: number; aircraft: Aircraft[] };
  ais: AisStatus;
}

export interface InfoenvModule {
  index: IndexSnapshot | null;
  headlines: Headline[];
  events: DomainEvent[];
}

export interface AppState {
  ts: number;
  jobs: Record<string, { lastSuccess: number | null; lastError: number | null; lastErrorMsg: string | null }>;
  metrics: Record<string, MetricPoint>;
  modules: {
    nordic: NordicModule;
    infoenv: InfoenvModule;
  };
}

export type SeriesData = [number, number][];
