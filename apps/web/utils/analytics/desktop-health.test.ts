import { describe, expect, it } from "vitest";
import { buildDesktopHealthProperties } from "@/utils/analytics/desktop-health";

describe("buildDesktopHealthProperties", () => {
  it("flattens each measured duration into count and percentile properties", () => {
    expect(
      buildDesktopHealthProperties({
        version: "1.2.3",
        intervalMs: 3_600_000,
        mainEventLoopDelayMs: { count: 180, p50Ms: 1.2, p95Ms: 8, maxMs: 240 },
        engine: {
          running: true,
          restarts: 1,
          child: {
            eventLoopDelayMs: { count: 180, p50Ms: 2, p95Ms: 40, maxMs: 900 },
            sqliteReadMs: null,
            sqliteWriteMs: { count: 12, p50Ms: 30, p95Ms: 120, maxMs: 400 },
          },
        },
        mailboxBytes: 1024,
      }),
    ).toEqual({
      desktop_version: "1.2.3",
      interval_ms: 3_600_000,
      mailbox_bytes: 1024,
      engine_running: true,
      engine_restarts: 1,
      main_loop_delay_count: 180,
      main_loop_delay_p50_ms: 1.2,
      main_loop_delay_p95_ms: 8,
      main_loop_delay_max_ms: 240,
      engine_loop_delay_count: 180,
      engine_loop_delay_p50_ms: 2,
      engine_loop_delay_p95_ms: 40,
      engine_loop_delay_max_ms: 900,
      sqlite_write_count: 12,
      sqlite_write_p50_ms: 30,
      sqlite_write_p95_ms: 120,
      sqlite_write_max_ms: 400,
    });
  });

  it("reports a stopped engine without engine metrics", () => {
    expect(
      buildDesktopHealthProperties({
        version: "1.2.3",
        intervalMs: 120_000,
        mainEventLoopDelayMs: null,
        engine: null,
        mailboxBytes: 0,
      }),
    ).toEqual({
      desktop_version: "1.2.3",
      interval_ms: 120_000,
      mailbox_bytes: 0,
      engine_running: false,
      engine_restarts: 0,
    });
  });
});
