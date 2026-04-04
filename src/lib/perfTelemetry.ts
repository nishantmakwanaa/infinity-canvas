type PerfMetricName =
  | 'render_commit'
  | 'dropped_frame'
  | 'autosave_flush_success'
  | 'autosave_flush_error'
  | 'autosave_flush_batch';

interface PerfMetric {
  name: PerfMetricName;
  ts: number;
  value: number;
  meta?: Record<string, string | number | boolean | null>;
}

interface PerfStore {
  events: PerfMetric[];
  monitorRefs: number;
  monitorRafId: number | null;
  lastRafTs: number;
}

const MAX_PERF_EVENTS = 600;

declare global {
  interface Window {
    __cnvsPerf?: PerfStore;
  }
}

function getPerfStore(): PerfStore | null {
  if (typeof window === 'undefined') return null;
  if (!window.__cnvsPerf) {
    window.__cnvsPerf = {
      events: [],
      monitorRefs: 0,
      monitorRafId: null,
      lastRafTs: 0,
    };
  }
  return window.__cnvsPerf;
}

function shouldConsoleLog() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem('cnvs_perf_console') === '1';
  } catch {
    return false;
  }
}

export function recordPerfMetric(
  name: PerfMetricName,
  value: number,
  meta?: Record<string, string | number | boolean | null>
) {
  const store = getPerfStore();
  if (!store) return;

  const metric: PerfMetric = {
    name,
    ts: Date.now(),
    value,
    meta,
  };

  store.events.push(metric);
  if (store.events.length > MAX_PERF_EVENTS) {
    store.events.splice(0, store.events.length - MAX_PERF_EVENTS);
  }

  if (shouldConsoleLog()) {
    // eslint-disable-next-line no-console
    console.debug('[CNVS PERF]', metric);
  }
}

export function startDroppedFrameMonitor() {
  const store = getPerfStore();
  if (!store) return () => undefined;

  store.monitorRefs += 1;
  if (store.monitorRafId !== null) {
    return () => {
      const nextStore = getPerfStore();
      if (!nextStore) return;
      nextStore.monitorRefs = Math.max(0, nextStore.monitorRefs - 1);
      if (nextStore.monitorRefs === 0 && nextStore.monitorRafId !== null) {
        cancelAnimationFrame(nextStore.monitorRafId);
        nextStore.monitorRafId = null;
        nextStore.lastRafTs = 0;
      }
    };
  }

  store.lastRafTs = performance.now();

  const tick = (ts: number) => {
    const activeStore = getPerfStore();
    if (!activeStore || activeStore.monitorRefs === 0) return;

    const delta = ts - activeStore.lastRafTs;
    activeStore.lastRafTs = ts;

    if (delta > 34) {
      const dropped = Math.max(1, Math.round(delta / 16.67) - 1);
      recordPerfMetric('dropped_frame', delta, { dropped });
    }

    activeStore.monitorRafId = requestAnimationFrame(tick);
  };

  store.monitorRafId = requestAnimationFrame(tick);

  return () => {
    const nextStore = getPerfStore();
    if (!nextStore) return;
    nextStore.monitorRefs = Math.max(0, nextStore.monitorRefs - 1);
    if (nextStore.monitorRefs === 0 && nextStore.monitorRafId !== null) {
      cancelAnimationFrame(nextStore.monitorRafId);
      nextStore.monitorRafId = null;
      nextStore.lastRafTs = 0;
    }
  };
}

export function getPerfMetricsSnapshot() {
  const store = getPerfStore();
  return store ? [...store.events] : [];
}
