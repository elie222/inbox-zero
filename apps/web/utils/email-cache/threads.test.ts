import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearEmailCache, clearEmailCacheForAccount } from "./database";
import { readCachedThread, writeCachedThread } from "./threads";

type TestThreadResponse = { thread: { id: string; body: string } };

describe("cached thread details", () => {
  beforeEach(async () => {
    await clearEmailCache();
  });

  it("isolates thread response variants", async () => {
    await writeCachedThread({
      emailAccountId: "account-1",
      threadId: "thread-1",
      variant: "drafts:0|replies:0",
      data: { thread: { id: "thread-1", body: "without drafts" } },
    });

    await expect(
      readCachedThread<TestThreadResponse>({
        emailAccountId: "account-1",
        threadId: "thread-1",
        variant: "drafts:1|replies:0",
      }),
    ).resolves.toBeUndefined();
  });

  it("clears one account without affecting another", async () => {
    for (const emailAccountId of ["account-1", "account-2"]) {
      await writeCachedThread({
        emailAccountId,
        threadId: "thread-1",
        variant: "drafts:0|replies:0",
        data: { thread: { id: "thread-1", body: emailAccountId } },
      });
    }

    await clearEmailCacheForAccount("account-1");

    await expect(
      readCachedThread<TestThreadResponse>({
        emailAccountId: "account-1",
        threadId: "thread-1",
        variant: "drafts:0|replies:0",
      }),
    ).resolves.toBeUndefined();
    await expect(
      readCachedThread<TestThreadResponse>({
        emailAccountId: "account-2",
        threadId: "thread-1",
        variant: "drafts:0|replies:0",
      }),
    ).resolves.toMatchObject({
      data: { thread: { body: "account-2" } },
    });
  });

  it("does not return expired thread details", async () => {
    await writeCachedThread({
      emailAccountId: "account-1",
      threadId: "thread-1",
      variant: "drafts:0|replies:0",
      data: { thread: { id: "thread-1", body: "Expired" } },
      now: Date.now() - 31 * 24 * 60 * 60 * 1000,
    });

    await expect(
      readCachedThread<TestThreadResponse>({
        emailAccountId: "account-1",
        threadId: "thread-1",
        variant: "drafts:0|replies:0",
      }),
    ).resolves.toBeUndefined();
  });
});
