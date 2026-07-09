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

export interface HpiComponent {
  score: number;
  raw: Record<string, unknown>;
  ts: number;
}

export interface HpiSnapshot {
  ts: number;
  hpi: number;
  band: string;
  components: Record<string, HpiComponent>;
  used: string[];
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
}

export interface HormuzEvent {
  ts: string;
  type: string;
  en: string;
  fi: string;
  url: string;
}

export interface AppState {
  ts: number;
  hpi: HpiSnapshot | null;
  metrics: Record<string, MetricPoint>;
  vessels: Vessel[];
  transitsToday: { in: number; out: number };
  uniqueLargeToday: { tankers: number; cargo: number };
  headlines: Headline[];
  events: HormuzEvent[];
  ais: { disabled: boolean; connected: boolean; lastMsgTs: number | null; msgCount: number; streaming: boolean };
  jobs: Record<string, { lastSuccess: number | null; lastError: number | null; lastErrorMsg: string | null }>;
  flights: { ts: number; aircraft: { icao: string; cs: string | null; lon: number; lat: number; alt: number | null; trk: number | null }[] };
}

export type SeriesData = [number, number][];
