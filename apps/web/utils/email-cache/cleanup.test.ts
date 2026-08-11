// @vitest-environment jsdom

import "fake-indexeddb/auto";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scheduleEmailCacheCleanup } from "./cleanup";
import { clearEmailCache, getEmailCacheDatabase } from "./database";

const storageDescriptor = Object.getOwnPropertyDescriptor(navigator, "storage");
const requestIdleCallbackDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "requestIdleCallback",
);

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

  afterEach(() => {
    restoreProperty(navigator, "storage", storageDescriptor);
    restoreProperty(
      window,
      "requestIdleCallback",
      requestIdleCallbackDescriptor,
    );
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

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
  } else {
    Reflect.deleteProperty(target, property);
  }
}
