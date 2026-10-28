import posthog from "posthog-js";
import { MAIL_ANALYTICS_EVENTS } from "@/utils/analytics/product";
import { scheduleSummaryFlush } from "@/utils/analytics/summary-flush";

export const MAIL_PERFORMANCE_SAMPLE_RATE = 0.05;

const MAX_SAMPLES_PER_METRIC = 500;
const INPUT_EVENT_DURATION_THRESHOLD_MS = 40;
const INPUT_EVENT_TYPES = new Set(["keydown", "pointerdown", "click"]);
const LONG_TASK_BLOCKING_THRESHOLD_MS = 50;

type MailPerformanceSamples = {
  input_event: number[];
  long_task: number[];
  thread_switch: number[];
};

let samples: MailPerformanceSamples = emptySamples();
let sampled: boolean | undefined;

/**
 * Decided once per page load. The first sampled call starts the observers and
 * the summary flush; unsampled sessions never create either.
 */
export function isMailPerformanceSampled(): boolean {
  if (sampled === undefined) {
    sampled =
      posthog.__loaded &&
      !posthog.has_opted_out_capturing() &&
      shouldSampleSession(Math.random());
    if (sampled) startCollecting();
  }
  return sampled;
}

export function shouldSampleSession(random: number): boolean {
  return random < MAIL_PERFORMANCE_SAMPLE_RATE;
}

export function recordThreadSwitchLatency(durationMs: number) {
  if (!sampled) return;
  pushSample(samples.thread_switch, durationMs);
}

export function buildMailPerformanceSummary(
  input: MailPerformanceSamples,
): Record<string, number> | null {
  const properties: Record<string, number> = {};
  let hasData = false;

  for (const [metric, values] of Object.entries(input)) {
    if (values.length === 0) continue;
    hasData = true;
    const summary = summarizeDurations(values);
    properties[`${metric}_count`] = summary.count;
    properties[`${metric}_p50_ms`] = summary.p50;
    properties[`${metric}_p75_ms`] = summary.p75;
    properties[`${metric}_p95_ms`] = summary.p95;
    properties[`${metric}_max_ms`] = summary.max;
  }
  if (!hasData) return null;

  if (input.long_task.length > 0) {
    properties.long_task_total_blocking_ms = Math.round(
      input.long_task.reduce(
        (total, duration) =>
          total + Math.max(0, duration - LONG_TASK_BLOCKING_THRESHOLD_MS),
        0,
      ),
    );
  }

  return properties;
}

export function summarizeDurations(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p95: percentile(sorted, 95),
    max: Math.round(sorted[sorted.length - 1]),
  };
}

function startCollecting() {
  observe(
    "event",
    (entry) => {
      if (INPUT_EVENT_TYPES.has(entry.name)) {
        pushSample(samples.input_event, entry.duration);
      }
    },
    { durationThreshold: INPUT_EVENT_DURATION_THRESHOLD_MS },
  );
  observe("longtask", (entry) => pushSample(samples.long_task, entry.duration));

  scheduleSummaryFlush((capture) => {
    const summary = buildMailPerformanceSummary(samples);
    samples = emptySamples();
    if (!summary) return;
    capture(MAIL_ANALYTICS_EVENTS.performanceSummary, {
      ...summary,
      sample_rate: MAIL_PERFORMANCE_SAMPLE_RATE,
    });
  });
}

function observe(
  type: string,
  onEntry: (entry: PerformanceEntry) => void,
  options?: { durationThreshold: number },
) {
  if (
    typeof PerformanceObserver === "undefined" ||
    !PerformanceObserver.supportedEntryTypes?.includes(type)
  ) {
    return;
  }
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) onEntry(entry);
  }).observe({ type, ...options });
}

function pushSample(buffer: number[], value: number) {
  if (buffer.length >= MAX_SAMPLES_PER_METRIC) buffer.shift();
  buffer.push(value);
}

// Nearest-rank, so every reported value is one that was actually measured.
function percentile(sorted: number[], p: number) {
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[index]);
}

function emptySamples(): MailPerformanceSamples {
  return { input_event: [], long_task: [], thread_switch: [] };
}
