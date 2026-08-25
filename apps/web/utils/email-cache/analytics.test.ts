// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackMailboxListReady, trackMailboxSyncResult } from "./analytics";

const analytics = vi.hoisted(() => ({ capture: vi.fn() }));
const desktop = vi.hoisted(() => ({ getApp: vi.fn() }));

vi.mock("posthog-js", () => ({
  default: { capture: analytics.capture },
}));
vi.mock("@/utils/desktop-app", () => ({
  getInboxZeroDesktopApp: desktop.getApp,
}));

const storageDescriptor = Object.getOwnPropertyDescriptor(navigator, "storage");

describe("email cache analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    desktop.getApp.mockReturnValue({});
  });

  afterEach(() => {
    if (storageDescriptor) {
      Object.defineProperty(navigator, "storage", storageDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "storage");
    }
  });

  it("captures operational metrics without mailbox content", async () => {
    const estimate = vi.fn().mockResolvedValue({
      quota: 10_000,
      usage: 2500,
    });
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { estimate },
    });

    trackMailboxListReady({
      durationMs: 12.6,
      source: "mailbox",
      threadCount: 42,
    });
    trackMailboxSyncResult({
      durationMs: 20.4,
      hasMore: false,
      outcome: "success",
      pagesSynced: 1,
      phase: "initial",
    });
    trackMailboxSyncResult({
      durationMs: 5,
      hasMore: false,
      outcome: "success",
      pagesSynced: 1,
      phase: "poll",
    });
    await Promise.resolve();

    expect(analytics.capture).toHaveBeenCalledWith("mailbox_list_ready", {
      duration_ms: 13,
      runtime: "desktop",
      source: "mailbox",
      thread_count: 42,
    });
    expect(analytics.capture).toHaveBeenCalledWith("mailbox_sync_result", {
      consecutive_failures: undefined,
      duration_ms: 20,
      has_more: false,
      outcome: "success",
      pages_synced: 1,
      phase: "initial",
      retry_delay_ms: undefined,
      runtime: "desktop",
    });
    expect(analytics.capture).toHaveBeenCalledWith(
      "email_cache_storage_estimated",
      {
        quota_bytes: 10_000,
        runtime: "desktop",
        usage_bytes: 2500,
        usage_ratio: 0.25,
      },
    );
    expect(estimate).toHaveBeenCalledOnce();
  });
});
