import {
  createHistogram,
  monitorEventLoopDelay,
  type RecordableHistogram,
} from "node:perf_hooks";

const EVENT_LOOP_RESOLUTION_MS = 20;
const NS_PER_MS = 1_000_000;

export type DurationSummary = {
  count: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

/**
 * Samples how late this process's event loop runs a timer. Each `drain`
 * summarizes the samples since the previous one.
 */
export function startEventLoopDelayMonitor() {
  const histogram = monitorEventLoopDelay({
    resolution: EVENT_LOOP_RESOLUTION_MS,
  });
  histogram.enable();
  return {
    // Samples are the full time between timer ticks, so an idle loop would
    // otherwise report the resolution as its delay.
    drain: () => drainHistogram(histogram, EVENT_LOOP_RESOLUTION_MS),
  };
}

export function createDurationRecorder() {
  const histogram = createHistogram();
  return {
    record(durationMs: number) {
      histogram.record(Math.max(1, Math.round(durationMs * NS_PER_MS)));
    },
    drain: () => drainHistogram(histogram, 0),
  };
}

function drainHistogram(
  histogram: Pick<
    RecordableHistogram,
    "count" | "percentile" | "max" | "reset"
  >,
  offsetMs: number,
): DurationSummary | null {
  if (histogram.count === 0) return null;
  const toMs = (ns: number) =>
    Math.max(0, Math.round((ns / NS_PER_MS - offsetMs) * 10) / 10);
  const summary = {
    count: histogram.count,
    p50Ms: toMs(histogram.percentile(50)),
    p95Ms: toMs(histogram.percentile(95)),
    maxMs: toMs(histogram.max),
  };
  histogram.reset();
  return summary;
}
