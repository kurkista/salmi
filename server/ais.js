// @ts-check
// ais.js — AISStream.io websocket client. Uses Node's built-in WebSocket
// (Node ≥22, undici) so there is no ws dependency. The subscription message
// MUST be sent within 3 seconds of the socket opening or AISStream closes it.
import { AIS } from './config.js';

const state = {
  connected: false,
  disabled: false,
  lastMsgTs: 0,
  msgCount: 0,
  attempts: 0,
};

/** @type {WebSocket | null} */
let socket = null;

/**
 * @param {(msg: any) => void} onMessage parsed AISStream envelope
 */
export function startAis(onMessage) {
  if (!AIS.apiKey) {
    state.disabled = true;
    console.warn(
      '[ais] AISSTREAM_API_KEY not set — live vessel layer disabled. ' +
      'Register a free key at https://aisstream.io and set the env var.'
    );
    return;
  }
  connect(onMessage);

  // Watchdog: AISStream sometimes stalls without closing the socket.
  setInterval(() => {
    if (state.connected && Date.now() - state.lastMsgTs > AIS.stallMs) {
      console.warn('[ais] no messages for 3 min — forcing reconnect');
      try { socket?.close(); } catch { /* already closing */ }
    }
  }, 30_000).unref?.();
}

/** @param {(msg: any) => void} onMessage */
function connect(onMessage) {
  state.attempts++;
  const connectedAt = Date.now();
  socket = new WebSocket(AIS.url);
  socket.binaryType = 'arraybuffer';
  const decoder = new TextDecoder();

  socket.addEventListener('open', () => {
    state.connected = true;
    state.lastMsgTs = Date.now();
    console.log('[ais] connected, subscribing to Hormuz bounding box');
    socket?.send(JSON.stringify({
      APIKey: AIS.apiKey,
      BoundingBoxes: [AIS.boundingBox],
      FilterMessageTypes: AIS.messageTypes,
    }));
  });

  socket.addEventListener('message', (ev) => {
    state.lastMsgTs = Date.now();
    state.msgCount++;
    try {
      const text = typeof ev.data === 'string' ? ev.data : decoder.decode(ev.data);
      const msg = JSON.parse(text);
      if (msg.error) {
        // e.g. bad API key — don't hot-loop on a permanent error
        console.error('[ais] stream error:', msg.error);
        return;
      }
      onMessage(msg);
    } catch (err) {
      // one bad frame is not worth crashing the stream over
      console.warn('[ais] unparseable frame:', err instanceof Error ? err.message : err);
    }
  });

  socket.addEventListener('close', () => {
    state.connected = false;
    // Stable for >60s? Treat the next connect as a fresh start.
    if (Date.now() - connectedAt > 60_000) state.attempts = 0;
    const base = Math.min(AIS.reconnectMaxMs, AIS.reconnectMinMs * 2 ** state.attempts);
    const delay = Math.round(base * (0.8 + Math.random() * 0.4)); // ±20% jitter
    console.warn(`[ais] disconnected, reconnecting in ${Math.round(delay / 1000)}s`);
    setTimeout(() => connect(onMessage), delay);
  });

  socket.addEventListener('error', () => {
    // 'close' always follows; backoff happens there
  });
}

export function aisStatus() {
  return {
    disabled: state.disabled,
    connected: state.connected,
    lastMsgTs: state.lastMsgTs || null,
    msgCount: state.msgCount,
  };
}
