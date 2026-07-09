// @ts-check
// scheduler.js — tiny setInterval registry. Every job run is wrapped in
// try/catch and its last success/error is tracked; that record drives the
// per-source staleness badges in the UI (we never pretend data is fresh).

/** @type {Map<string, {lastSuccess: number|null, lastError: number|null, lastErrorMsg: string|null, runs: number}>} */
const jobs = new Map();

let bootStagger = 0;

/**
 * @param {string} name
 * @param {() => Promise<void>} fn
 * @param {number} intervalMs
 * @param {{immediate?: boolean}} [opts]
 */
export function register(name, fn, intervalMs, opts = {}) {
  const status = { lastSuccess: null, lastError: null, lastErrorMsg: null, runs: 0 };
  jobs.set(name, status);

  const run = async () => {
    status.runs++;
    try {
      await fn();
      status.lastSuccess = Date.now();
      status.lastError = null;
      status.lastErrorMsg = null;
    } catch (err) {
      status.lastError = Date.now();
      status.lastErrorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[scheduler] ${name} failed: ${status.lastErrorMsg}`);
    }
  };

  // Stagger first runs over the boot minute so we don't burst-fetch everything
  // at once (and so GDELT's 5s spacing rule is never violated at startup).
  if (opts.immediate !== false) {
    bootStagger += 5_000;
    setTimeout(run, bootStagger);
  }
  setInterval(run, intervalMs).unref?.();
}

export function jobStatus() {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [name, s] of jobs) out[name] = s;
  return out;
}
