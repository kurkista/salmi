// map.ts — MapLibre map with the live vessel layer and the transit gate line.
// Basemap: CARTO dark-matter (free with attribution, no key).
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Vessel } from './types';
import { t } from './i18n';

const COLORS = { tanker: '#c98500', cargo: '#3987e5', other: '#898781' };

const vessels = new Map<number, Vessel>();
let map: maplibregl.Map;
let loaded = false;

function catOf(type: number | null): 'tanker' | 'cargo' | 'other' {
  if (type !== null && type >= 80 && type <= 89) return 'tanker';
  if (type !== null && type >= 70 && type <= 79) return 'cargo';
  return 'other';
}

function toFeatureCollection(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [...vessels.values()].map((v) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
      properties: {
        mmsi: v.mmsi,
        name: v.name ?? String(v.mmsi),
        cat: catOf(v.type),
        sog: v.sog ?? 0,
        hdg: v.hdg ?? -1,
        hasHdg: v.hdg !== null && (v.sog ?? 0) > 0.5,
      },
    })),
  };
}

/** White triangle rendered as an SDF so icon-color can tint it per category. */
function arrowImage(): { width: number; height: number; data: Uint8Array } {
  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.beginPath();
  ctx.moveTo(size / 2, 3);
  ctx.lineTo(size - 6, size - 5);
  ctx.lineTo(size / 2, size - 9);
  ctx.lineTo(6, size - 5);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  return ctx.getImageData(0, 0, size, size) as unknown as { width: number; height: number; data: Uint8Array };
}

export function initMap(container: HTMLElement, initial: Vessel[]): void {
  for (const v of initial) vessels.set(v.mmsi, v);

  map = new maplibregl.Map({
    container,
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [56.4, 26.35], // the narrows
    zoom: 7.4,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  map.on('load', () => {
    map.addImage('vessel-arrow', arrowImage(), { sdf: true });

    // transit gate (56.5°E across the narrows) — subtle dashed line
    map.addSource('gate', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[56.5, 25.9], [56.5, 26.9]] },
        properties: {},
      },
    });
    map.addLayer({
      id: 'gate-line',
      type: 'line',
      source: 'gate',
      paint: { 'line-color': '#c3c2b7', 'line-opacity': 0.45, 'line-width': 1.5, 'line-dasharray': [2, 3] },
    });

    map.addSource('vessels', { type: 'geojson', data: toFeatureCollection() });

    const colorByCat: any = [
      'match', ['get', 'cat'],
      'tanker', COLORS.tanker,
      'cargo', COLORS.cargo,
      COLORS.other,
    ];

    // stationary / heading-unknown vessels as dots
    map.addLayer({
      id: 'vessel-dots',
      type: 'circle',
      source: 'vessels',
      filter: ['!', ['get', 'hasHdg']],
      paint: {
        'circle-color': colorByCat,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2.5, 10, 5],
        'circle-opacity': 0.85,
        'circle-stroke-color': '#111111',
        'circle-stroke-width': 0.8,
      },
    });

    // moving vessels as heading-rotated arrows
    map.addLayer({
      id: 'vessel-arrows',
      type: 'symbol',
      source: 'vessels',
      filter: ['get', 'hasHdg'],
      layout: {
        'icon-image': 'vessel-arrow',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.45, 10, 0.8],
        'icon-rotate': ['get', 'hdg'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
      },
      paint: { 'icon-color': colorByCat, 'icon-opacity': 0.95 },
    });

    for (const layer of ['vessel-dots', 'vessel-arrows']) {
      map.on('click', layer, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as any;
        new maplibregl.Popup({ closeButton: false })
          .setLngLat((f.geometry as any).coordinates)
          .setHTML(
            `<strong>${escapeHtml(p.name)}</strong><br>` +
            `${t('legend.' + p.cat)} · ${Number(p.sog).toFixed(1)} ${t('map.kn')}`,
          )
          .addTo(map);
      });
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    }

    addLegend(container);
    loaded = true;
  });
}

/** Apply an SSE vessels delta ({upsert, remove}) and refresh the source. */
export function updateVessels(delta: { upsert?: Vessel[]; remove?: number[] }): void {
  for (const v of delta.upsert ?? []) vessels.set(v.mmsi, v);
  for (const mmsi of delta.remove ?? []) vessels.delete(mmsi);
  if (!loaded) return;
  const src = map.getSource('vessels') as maplibregl.GeoJSONSource | undefined;
  src?.setData(toFeatureCollection());
}

export const vesselCount = () => vessels.size;

function addLegend(container: HTMLElement) {
  const el = document.createElement('div');
  el.style.cssText =
    'position:absolute;bottom:26px;left:10px;z-index:5;background:rgba(26,26,25,.85);' +
    'border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:6px 10px;font-size:11.5px;color:#c3c2b7';
  el.innerHTML = (['tanker', 'cargo', 'other'] as const)
    .map((c) => `<span style="color:${COLORS[c]}">●</span> ${t('legend.' + c)}`)
    .join('&nbsp;&nbsp;');
  container.appendChild(el);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
