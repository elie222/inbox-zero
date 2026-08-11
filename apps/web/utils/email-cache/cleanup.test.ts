// @vitest-environment jsdom

import "fake-indexeddb/auto";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { scheduleEmailCacheCleanup } from "./cleanup";
import { clearEmailCache, getEmailCacheDatabase } from "./database";

describe("email cache cleanup", () => {
  beforeEach(async () => {
    await clearEmailCache();
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { estimate: async () => ({ quota: 100 }) },
    });
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: (callback: IdleRequestCallback) => {
        queueMicrotask(() =>
          callback({ didTimeout: false, timeRemaining: () => 50 }),
        );
        return 1;
      },
    });
  });

  it("retains the newest details within the storage budget", async () => {
    const database = await getEmailCacheDatabase();
    expect(database).toBeDefined();
    const now = Date.now();
    const variant = "drafts:0|replies:0";

    await database?.put("threadDetails", {
      emailAccountId: "account-1",
      threadId: "older",
      variant,
      data: { id: "older" },
      fetchedAt: now,
      lastAccessedAt: now - 1,
      byteSize: 8,
    });
    await database?.put("threadDetails", {
      emailAccountId: "account-1",
      threadId: "newer",
      variant,
      data: { id: "newer" },
      fetchedAt: now,
      lastAccessedAt: now,
      byteSize: 8,
    });

    scheduleEmailCacheCleanup({ force: true });

    await waitFor(async () => {
      await expect(
        database?.get("threadDetails", ["account-1", "older", variant]),
      ).resolves.toBeUndefined();
    });
    await expect(
      database?.get("threadDetails", ["account-1", "newer", variant]),
    ).resolves.toBeDefined();
  });
});
