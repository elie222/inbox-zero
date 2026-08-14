import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import type { ThreadListItem } from "@/utils/threads/load";
import { loadCombinedThreads } from "./load-combined";

const logger = createTestLogger();

describe("loadCombinedThreads", () => {
  it("merges account pages newest-first and keeps account ownership on each row", async () => {
    const loadPage = vi.fn(async ({ account }: { account: Account }) => ({
      threads:
        account.id === "account-1"
          ? [thread("older", "2026-08-12T10:00:00.000Z")]
          : [thread("newer", "2026-08-13T10:00:00.000Z")],
      nextPageToken: null,
    }));

    const result = await loadCombinedThreads({
      accounts: [account("account-1"), account("account-2")],
      cursor: null,
      loadPage,
      logger,
    });

    expect(result.threads.map((item) => item.id)).toEqual(["newer", "older"]);
    expect(result.threads.map((item) => item.account.id)).toEqual([
      "account-2",
      "account-1",
    ]);
    expect(result.nextPageToken).toBeNull();
    expect(result.failedAccountIds).toEqual([]);
  });

  it("continues each account independently and does not restart exhausted accounts", async () => {
    const loadPage = vi.fn(async ({ account }: { account: Account }) => ({
      threads: [thread(`${account.id}-thread`, "2026-08-13T10:00:00.000Z")],
      nextPageToken: `${account.id}-next`,
    }));

    const first = await loadCombinedThreads({
      accounts: [account("account-1"), account("account-2")],
      cursor: null,
      loadPage,
      logger,
    });
    const second = await loadCombinedThreads({
      accounts: [account("account-1"), account("account-2")],
      cursor: first.nextPageToken,
      loadPage: vi.fn(async ({ account, pageToken }) => ({
        threads: [
          thread(`${account.id}-${pageToken}`, "2026-08-12T10:00:00.000Z"),
        ],
        nextPageToken: account.id === "account-1" ? null : "account-2-last",
      })),
      logger,
    });

    expect(second.threads.map((item) => item.id)).toEqual([
      "account-1-account-1-next",
      "account-2-account-2-next",
    ]);

    const thirdPageLoader = vi.fn(
      async ({ account }: { account: Account }) => ({
        threads: [thread(`${account.id}-last`, "2026-08-11T10:00:00.000Z")],
        nextPageToken: null,
      }),
    );
    await loadCombinedThreads({
      accounts: [account("account-1"), account("account-2")],
      cursor: second.nextPageToken,
      loadPage: thirdPageLoader,
      logger,
    });

    expect(thirdPageLoader).toHaveBeenCalledTimes(1);
    expect(thirdPageLoader).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({ id: "account-2" }),
      }),
    );
  });

  it("returns successful accounts when another mailbox fails", async () => {
    const result = await loadCombinedThreads({
      accounts: [account("working"), account("failed")],
      cursor: null,
      loadPage: vi.fn(async ({ account }) => {
        if (account.id === "failed") throw new Error("Mailbox unavailable");
        return {
          threads: [thread("working-thread", "2026-08-13T10:00:00.000Z")],
          nextPageToken: null,
        };
      }),
      logger,
    });

    expect(result.threads.map((item) => item.id)).toEqual(["working-thread"]);
    expect(result.failedAccountIds).toEqual(["failed"]);
    expect(result.nextPageToken).toBeNull();
  });
});

type Account = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  provider: string;
};

function account(id: string): Account {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    image: null,
    provider: "google",
  };
}

function thread(id: string, internalDate: string): ThreadListItem {
  return {
    id,
    snippet: id,
    plan: undefined,
    plans: [],
    messages: [
      {
        id: `${id}-message`,
        threadId: id,
        snippet: id,
        subject: id,
        date: internalDate,
        internalDate,
        labelIds: ["INBOX"],
        headers: {
          date: internalDate,
          from: "sender@example.com",
          subject: id,
          to: "recipient@example.com",
        },
      },
    ],
  };
}
