// api.ts — the single data-read seam. If salmi is ever sundowned to a static
// GitHub Pages build fed from data/export/, this is the only file to change.
import type { AppState, SeriesData } from './types';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

export const getState = () => getJson<AppState>('/api/state');

export const getSeries = (metric: string, days = 30) =>
  getJson<SeriesData>(`/api/series/${metric}?days=${days}`);

export const getTransits = (days = 30) =>
  getJson<{ own: any[]; ownToday: { in: number; out: number }; recent: any[]; portwatch: SeriesData }>(
    `/api/transits?days=${days}`,
  );

export const getMethodology = async (): Promise<string> => {
  const res = await fetch('/api/methodology');
  if (!res.ok) throw new Error(`methodology: ${res.status}`);
  return res.text();
};
