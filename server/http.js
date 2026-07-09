// @ts-check
// http.js — express app: static frontend, JSON API, SSE hub. This file is the
// contract between server and browser (and the daily export GitHub Action).
import express from 'express';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_METRICS, SSE } from './config.js';
import {
  latestSeries, seriesSince, latestHpiSnapshot, recentHeadlines,
  vesselsDailySince, transitsSince,
} from './db.js';
import { jobStatus } from './scheduler.js';
import { aisStatus } from './ais.js';
import { bus } from './bus.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const events = JSON.parse(readFileSync(path.join(root, 'data/events.json'), 'utf8'));

/** @param {{store: import('./vessels.js').VesselStore}} deps */
export function startHttp({ store }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // --- SSE hub ---------------------------------------------------------------
  /** @type {Set<import('express').Response>} */
  const clients = new Set();

  function broadcast(event, data) {
    if (clients.size === 0) return;
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(frame);
  }

  setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, SSE.pingMs).unref?.();

  for (const event of ['vessels', 'transit', 'hpi', 'metric', 'headline', 'flights']) {
    bus.on(event, (data) => broadcast(event, data));
  }

  app.get('/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const hello = latestHpiSnapshot();
    res.write(`event: hello\ndata: ${JSON.stringify({ ts: Date.now(), hpi: hello?.hpi ?? null, band: hello?.band ?? null })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
  });

  // --- API ---------------------------------------------------------------------
  app.get('/healthz', (req, res) => {
    res.json({
      ok: true,
      uptimeS: Math.round(process.uptime()),
      rssMb: Math.round(process.memoryUsage.rss() / 1e6),
      ais: aisStatus(),
      sseClients: clients.size,
    });
  });

  app.get('/api/state', (req, res) => {
    /** @type {Record<string, any>} */
    const metrics = {};
    for (const m of PUBLIC_METRICS) {
      const row = latestSeries(m);
      if (row) metrics[m] = row;
    }
    res.json({
      ts: Date.now(),
      hpi: latestHpiSnapshot() ?? null,
      metrics,
      vessels: store.snapshot(),
      transitsToday: store.transitsToday,
      uniqueLargeToday: store.uniqueLargeToday(),
      headlines: recentHeadlines(20),
      events,
      ais: aisStatus(),
      jobs: jobStatus(),
    });
  });

  app.get('/api/series/:metric', (req, res) => {
    const { metric } = req.params;
    if (!PUBLIC_METRICS.includes(metric)) return res.status(404).json({ error: 'unknown metric' });
    const days = Math.min(Number(req.query.days) || 30, 400);
    res.json(seriesSince(metric, Date.now() - days * 24 * 3600_000).map((r) => [r.ts, r.value]));
  });

  app.get('/api/transits', (req, res) => {
    const days = Math.min(Number(req.query.days) || 30, 120);
    const sinceTs = Date.now() - days * 24 * 3600_000;
    const sinceDate = new Date(sinceTs).toISOString().slice(0, 10);
    res.json({
      own: vesselsDailySince(sinceDate),
      ownToday: store.transitsToday,
      recent: transitsSince(Date.now() - 24 * 3600_000, 100),
      portwatch: seriesSince('pw_total', sinceTs).map((r) => [r.ts, r.value]),
    });
  });

  app.get('/api/headlines', (req, res) => {
    res.json(recentHeadlines(Math.min(Number(req.query.limit) || 50, 200)));
  });

  app.get('/api/events', (req, res) => res.json(events));

  app.get('/api/methodology', (req, res) => {
    res.type('text/markdown').send(readFileSync(path.join(root, 'METHODOLOGY.md'), 'utf8'));
  });

  // Daily aggregates bundle — fetched by .github/workflows/export.yml so the
  // public repo keeps a durable copy of the data (the static-fallback parachute).
  app.get('/api/export', (req, res) => {
    const since = Date.now() - 400 * 24 * 3600_000;
    /** @type {Record<string, any>} */
    const daily = {};
    for (const m of ['brent_usd', 'brent_sigma20', 'pw_total', 'pw_tanker', 'pw_cargo', 'pw_7dma', 'hpi']) {
      daily[m] = seriesSince(m, since).map((r) => [r.ts, r.value]);
    }
    res.json({
      generated: new Date().toISOString(),
      daily,
      vesselsDaily: vesselsDailySince(new Date(since).toISOString().slice(0, 10)),
      latestHpi: latestHpiSnapshot() ?? null,
      headlines: recentHeadlines(100),
    });
  });

  // --- static frontend -----------------------------------------------------------
  app.use(express.static(path.join(root, 'dist')));

  const port = Number(process.env.PORT || 8080);
  const server = app.listen(port, () => console.log(`[http] listening on :${port}`));
  return { server, broadcast };
}
