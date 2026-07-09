// sse.ts — EventSource wiring. Auto-reconnect is built into EventSource;
// we only map named events to handlers.
export function connectSSE(handlers: Record<string, (data: any) => void>): EventSource {
  const es = new EventSource('/events');
  for (const [event, fn] of Object.entries(handlers)) {
    es.addEventListener(event, (e) => {
      try {
        fn(JSON.parse((e as MessageEvent).data));
      } catch (err) {
        console.warn(`sse ${event} handler failed`, err);
      }
    });
  }
  return es;
}
