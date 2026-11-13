import { after } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleAccountAnalysis } from "@/utils/ai/knowledge/schedule-account-analysis";
import { createScopedLogger } from "@/utils/logger";
import { flushLoggerSafely } from "@/utils/logger-flush";
import {
  acquireOwnedLock,
  markOwnedLockProcessed,
} from "@/utils/redis/owned-lock";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/utils/redis", () => ({ redis: { get: vi.fn() } }));
vi.mock("@/utils/redis/owned-lock", () => ({
  acquireOwnedLock: vi.fn(),
  clearOwnedLock: vi.fn(),
  markOwnedLockProcessed: vi.fn(),
}));
vi.mock("@/utils/logger-flush", () => ({ flushLoggerSafely: vi.fn() }));

const logger = createScopedLogger("schedule-account-analysis-test");

describe("scheduleAccountAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(acquireOwnedLock).mockResolvedValue("lock-token");
    vi.mocked(flushLoggerSafely).mockResolvedValue(undefined);
  });

  it.each([
    "persona",
    "behavior",
    "writing-style",
  ] as const)("flushes logs when Redis finalization fails for %s", async (kind) => {
    const error = new Error("Redis unavailable");
    vi.mocked(markOwnedLockProcessed).mockRejectedValue(error);
    const run = vi.fn().mockResolvedValue(true);

    expect(
      await scheduleAccountAnalysis({
        emailAccountId: "account-id",
        kind,
        logger,
        run,
      }),
    ).toEqual({ status: "running" });
    expect(run).not.toHaveBeenCalled();
    const callback = vi.mocked(after).mock.calls[0][0];
    if (typeof callback !== "function")
      throw new Error("Expected an after callback");

    await expect(callback()).rejects.toThrow(error);

    expect(flushLoggerSafely).toHaveBeenCalledWith(logger, {
      action: kind,
      flushReason: "background-analysis",
    });
  });
});
