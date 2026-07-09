// @ts-check
// bus.js — one shared EventEmitter so pollers/vessels/hpi can publish without
// importing the HTTP layer (and vice versa). Events mirror the SSE protocol:
//   'metric'   {metric, ts, value}
//   'transit'  {ts, mmsi, name, dir}
//   'vessels'  {upsert, remove}
//   'hpi'      {hpi, band, components, used, version, ts}
//   'headline' {ts, title, url, source}
//   'flights'  {aircraft}
import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(20);
