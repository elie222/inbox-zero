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
            mailCommandMs: { count: 5, p50Ms: 90, p95Ms: 2400, maxMs: 31_000 },
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
      mail_command_count: 5,
      mail_command_p50_ms: 90,
      mail_command_p95_ms: 2400,
      mail_command_max_ms: 31_000,
    });
  });

  it("reports the stalest mail sync across accounts without per-account fields", () => {
    const account = {
      provider: "google" as const,
      connection: "ready" as const,
      newestInboxMessageAgeMs: 60_000,
      streams: 1,
      streamsBehind: 0,
      streamsPaused: 0,
      oldestStreamCaughtUpAgeMs: 30_000,
    };
    expect(
      buildDesktopHealthProperties({
        version: "1.2.3",
        intervalMs: 3_600_000,
        mainEventLoopDelayMs: null,
        engine: {
          running: true,
          restarts: 0,
          child: {
            eventLoopDelayMs: null,
            sqliteReadMs: null,
            sqliteWriteMs: null,
            mailSync: [
              account,
              {
                ...account,
                provider: "microsoft",
                connection: "offline",
                newestInboxMessageAgeMs: 7_200_000,
                streams: 4,
                streamsBehind: 2,
                streamsPaused: 1,
                oldestStreamCaughtUpAgeMs: 5_400_000,
              },
              {
                ...account,
                connection: "blocked_auth",
                newestInboxMessageAgeMs: null,
                oldestStreamCaughtUpAgeMs: null,
              },
            ],
          },
        },
        mailboxBytes: 1024,
      }),
    ).toMatchObject({
      mail_accounts: 3,
      mail_accounts_offline: 1,
      mail_accounts_blocked_auth: 1,
      mail_streams: 6,
      mail_streams_behind: 2,
      mail_streams_paused: 1,
      mail_inbox_newest_age_min_ms: 60_000,
      mail_inbox_newest_age_max_ms: 7_200_000,
      mail_stream_caught_up_age_max_ms: 5_400_000,
    });
  });

  it("leaves out ages no account has yet", () => {
    const properties = buildDesktopHealthProperties({
      version: "1.2.3",
      intervalMs: 120_000,
      mainEventLoopDelayMs: null,
      engine: {
        running: true,
        restarts: 0,
        child: {
          eventLoopDelayMs: null,
          sqliteReadMs: null,
          sqliteWriteMs: null,
          mailSync: [
            {
              provider: "google",
              connection: "ready",
              newestInboxMessageAgeMs: null,
              streams: 0,
              streamsBehind: 0,
              streamsPaused: 0,
              oldestStreamCaughtUpAgeMs: null,
            },
          ],
        },
      },
      mailboxBytes: 0,
    });
    expect(properties).toMatchObject({ mail_accounts: 1, mail_streams: 0 });
    expect(properties).not.toHaveProperty("mail_inbox_newest_age_max_ms");
    expect(properties).not.toHaveProperty("mail_stream_caught_up_age_max_ms");
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
