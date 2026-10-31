import { describe, expect, it } from "vitest";
import {
  buildMailPerformanceSummary,
  MAIL_PERFORMANCE_SAMPLE_RATE,
  shouldSampleSession,
  summarizeDurations,
} from "@/utils/analytics/mail-performance";

describe("summarizeDurations", () => {
  it("reports nearest-rank percentiles of measured values", () => {
    const values = Array.from({ length: 100 }, (_, index) => 100 - index);

    expect(summarizeDurations(values)).toEqual({
      count: 100,
      p50: 50,
      p75: 75,
      p95: 95,
      max: 100,
    });
  });

  it("uses the only value for every percentile of a single sample", () => {
    expect(summarizeDurations([41.6])).toEqual({
      count: 1,
      p50: 42,
      p75: 42,
      p95: 42,
      max: 42,
    });
  });
});

describe("buildMailPerformanceSummary", () => {
  it("returns null when nothing was measured", () => {
    expect(
      buildMailPerformanceSummary({
        input_event: [],
        long_task: [],
        thread_switch: [],
      }),
    ).toBeNull();
  });

  it("summarises only metrics with data and totals blocking time", () => {
    expect(
      buildMailPerformanceSummary({
        input_event: [],
        long_task: [60, 150],
        thread_switch: [20, 80],
      }),
    ).toEqual({
      long_task_count: 2,
      long_task_p50_ms: 60,
      long_task_p75_ms: 150,
      long_task_p95_ms: 150,
      long_task_max_ms: 150,
      long_task_total_blocking_ms: 110,
      thread_switch_count: 2,
      thread_switch_p50_ms: 20,
      thread_switch_p75_ms: 80,
      thread_switch_p95_ms: 80,
      thread_switch_max_ms: 80,
    });
  });
});

describe("shouldSampleSession", () => {
  it("samples draws below the rate only", () => {
    expect(shouldSampleSession(0)).toBe(true);
    expect(shouldSampleSession(MAIL_PERFORMANCE_SAMPLE_RATE - 0.001)).toBe(
      true,
    );
    expect(shouldSampleSession(MAIL_PERFORMANCE_SAMPLE_RATE)).toBe(false);
    expect(shouldSampleSession(0.99)).toBe(false);
  });
});
