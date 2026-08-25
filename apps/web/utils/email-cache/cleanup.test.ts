// @vitest-environment jsdom

import "fake-indexeddb/auto";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scheduleEmailCacheCleanup } from "./cleanup";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import {
  EMAIL_CACHE_MAILBOX_MAX_AGE_MS,
  EMAIL_CACHE_MAX_AGE_MS,
  MAIL_MUTATION_RETRY_WINDOW_MS,
} from "./policy";

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
    await database?.put("mailboxMessages", {
      emailAccountId: "account-1",
      messageId: "expired-message",
      threadId: "expired-thread",
      data: getMessage("expired-message", "expired-thread"),
      receivedAt: now - EMAIL_CACHE_MAILBOX_MAX_AGE_MS - 1,
      lastAccessedAt: now,
    });
    await database?.put("mailboxMessages", {
      emailAccountId: "account-1",
      messageId: "refresh-margin-message",
      threadId: "refresh-margin-thread",
      data: getMessage("refresh-margin-message", "refresh-margin-thread"),
      receivedAt: now - EMAIL_CACHE_MAX_AGE_MS - 1,
      lastAccessedAt: now,
    });
    await database?.put("mailboxMessages", {
      emailAccountId: "account-1",
      messageId: "recent-message",
      threadId: "recent-thread",
      data: getMessage("recent-message", "recent-thread"),
      receivedAt: now,
      lastAccessedAt: now,
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
    await expect(
      database?.get("mailboxMessages", ["account-1", "expired-message"]),
    ).resolves.toBeUndefined();
    await expect(
      database?.get("mailboxMessages", ["account-1", "recent-message"]),
    ).resolves.toBeDefined();
    await expect(
      database?.get("mailboxMessages", ["account-1", "refresh-margin-message"]),
    ).resolves.toBeDefined();
  });

  it("removes old terminal mutations but never active durable work", async () => {
    const database = await getEmailCacheDatabase();
    expect(database).toBeDefined();
    const now = Date.now();
    const expiredAt = now - MAIL_MUTATION_RETRY_WINDOW_MS - 1;
    const base = {
      batchId: "batch",
      emailAccountId: "account-1",
      threadId: "thread",
      messageIds: ["message"],
      kind: "archive" as const,
      payload: {},
      attempts: 1,
      nextAttemptAt: expiredAt,
      createdAt: expiredAt,
    };
    await database?.put("mailMutations", {
      ...base,
      id: "old-success",
      status: "succeeded",
      updatedAt: expiredAt,
    });
    await database?.put("mailMutations", {
      ...base,
      id: "old-retry",
      status: "retry_wait",
      updatedAt: expiredAt,
    });
    await database?.put("mailMutations", {
      ...base,
      id: "recent-failure",
      status: "failed",
      updatedAt: now,
    });

    scheduleEmailCacheCleanup({ force: true });

    await waitFor(async () => {
      await expect(
        database?.get("mailMutations", "old-success"),
      ).resolves.toBeUndefined();
    });
    await expect(
      database?.get("mailMutations", "old-retry"),
    ).resolves.toBeDefined();
    await expect(
      database?.get("mailMutations", "recent-failure"),
    ).resolves.toBeDefined();
  });
});

function getMessage(id: string, threadId: string) {
  const date = new Date().toISOString();
  return {
    date,
    headers: { date, from: "sender@example.com", subject: id, to: "me" },
    historyId: "1",
    id,
    inline: [],
    internalDate: date,
    snippet: id,
    subject: id,
    threadId,
  };
}

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
