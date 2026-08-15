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
      limit: 20,
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

  it("returns each account's labels for its combined rows", async () => {
    const result = await loadCombinedThreads({
      accounts: [account("account-1"), account("account-2")],
      cursor: null,
      limit: 20,
      loadPage: vi.fn(async ({ account }) => ({
        threads: [thread(`${account.id}-thread`, "2026-08-13T10:00:00.000Z")],
        nextPageToken: null,
        labels: [
          {
            id: `${account.id}-label`,
            name: `${account.id} label`,
            type: "user",
          },
        ],
      })),
      logger,
    });

    expect(result.labelsByAccount).toEqual({
      "account-1": {
        "account-1-label": {
          id: "account-1-label",
          name: "account-1 label",
          type: "user",
        },
      },
      "account-2": {
        "account-2-label": {
          id: "account-2-label",
          name: "account-2 label",
          type: "user",
        },
      },
    });
  });

  it("continues each account independently and does not restart exhausted accounts", async () => {
    const loadPage = vi.fn(async ({ account }: { account: Account }) => ({
      threads: [thread(`${account.id}-thread`, "2026-08-13T10:00:00.000Z")],
      nextPageToken: `${account.id}-next`,
    }));

    const first = await loadCombinedThreads({
      accounts: [account("account-1"), account("account-2")],
      cursor: null,
      limit: 20,
      loadPage,
      logger,
    });
    const second = await loadCombinedThreads({
      accounts: [account("account-1"), account("account-2")],
      cursor: first.nextPageToken,
      limit: 20,
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
      limit: 20,
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
      limit: 20,
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
    expect(result.nextPageToken).toEqual(expect.any(String));
  });

  it("returns a combined limit and preserves unreturned account rows", async () => {
    const loadPage = vi.fn(async ({ account }: { account: Account }) => ({
      threads:
        account.id === "account-1"
          ? [
              thread("first", "2026-08-14T10:00:00.000Z"),
              thread("third", "2026-08-12T10:00:00.000Z"),
            ]
          : [
              thread("second", "2026-08-13T10:00:00.000Z"),
              thread("fourth", "2026-08-11T10:00:00.000Z"),
            ],
      nextPageToken: null,
    }));

    const first = await loadCombinedThreads({
      accounts: [account("account-1"), account("account-2")],
      cursor: null,
      limit: 2,
      loadPage,
      logger,
    });
    const second = await loadCombinedThreads({
      accounts: [account("account-1"), account("account-2")],
      cursor: first.nextPageToken,
      limit: 2,
      loadPage,
      logger,
    });

    expect(first.threads.map((item) => item.id)).toEqual(["first", "second"]);
    expect(second.threads.map((item) => item.id)).toEqual(["third", "fourth"]);
    expect(second.nextPageToken).toBeNull();
  });

  it("tracks consumed rows by identity when a mailbox page changes", async () => {
    const connectedAccount = account("account-1");
    const first = await loadCombinedThreads({
      accounts: [connectedAccount],
      cursor: null,
      limit: 1,
      loadPage: vi.fn(async () => ({
        threads: [
          thread("existing-first", "2026-08-13T10:00:00.000Z"),
          thread("existing-second", "2026-08-12T10:00:00.000Z"),
        ],
        nextPageToken: "original-next",
      })),
      logger,
    });
    const second = await loadCombinedThreads({
      accounts: [connectedAccount],
      cursor: first.nextPageToken,
      limit: 1,
      loadPage: vi.fn(async () => ({
        threads: [
          thread("new-thread", "2026-08-14T10:00:00.000Z"),
          thread("existing-first", "2026-08-13T10:00:00.000Z"),
        ],
        nextPageToken: "shifted-next",
      })),
      logger,
    });
    const thirdPageLoader = vi.fn(async () => ({
      threads: [thread("existing-second", "2026-08-12T10:00:00.000Z")],
      nextPageToken: null,
    }));
    const third = await loadCombinedThreads({
      accounts: [connectedAccount],
      cursor: second.nextPageToken,
      limit: 1,
      loadPage: thirdPageLoader,
      logger,
    });

    expect(first.threads.map((item) => item.id)).toEqual(["existing-first"]);
    expect(second.threads.map((item) => item.id)).toEqual(["new-thread"]);
    expect(thirdPageLoader).toHaveBeenCalledWith(
      expect.objectContaining({ pageToken: "shifted-next" }),
    );
    expect(third.threads.map((item) => item.id)).toEqual(["existing-second"]);
  });

  it("loads newly connected accounts on a later page", async () => {
    const first = await loadCombinedThreads({
      accounts: [account("account-1")],
      cursor: null,
      limit: 1,
      loadPage: vi.fn(async () => ({
        threads: [thread("first", "2026-08-14T10:00:00.000Z")],
        nextPageToken: "account-1-next",
      })),
      logger,
    });
    const loadPage = vi.fn(async ({ account }: { account: Account }) => ({
      threads: [thread(account.id, "2026-08-13T10:00:00.000Z")],
      nextPageToken: null,
    }));

    await loadCombinedThreads({
      accounts: [account("account-1"), account("account-2")],
      cursor: first.nextPageToken,
      limit: 2,
      loadPage,
      logger,
    });

    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(loadPage).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({ id: "account-2" }),
        pageToken: undefined,
      }),
    );
  });

  it("retries an account after a transient failure", async () => {
    const first = await loadCombinedThreads({
      accounts: [account("account-1")],
      cursor: null,
      limit: 1,
      loadPage: vi.fn(async () => {
        throw new Error("Mailbox unavailable");
      }),
      logger,
    });
    const loadPage = vi.fn(async () => ({
      threads: [thread("recovered", "2026-08-14T10:00:00.000Z")],
      nextPageToken: null,
    }));

    const second = await loadCombinedThreads({
      accounts: [account("account-1")],
      cursor: first.nextPageToken,
      limit: 1,
      loadPage,
      logger,
    });

    expect(loadPage).toHaveBeenCalledOnce();
    expect(second.threads.map((item) => item.id)).toEqual(["recovered"]);
  });

  it("advances past an empty provider page", async () => {
    const first = await loadCombinedThreads({
      accounts: [account("account-1")],
      cursor: null,
      limit: 1,
      loadPage: vi.fn(async () => ({
        threads: [],
        nextPageToken: "next-provider-page",
      })),
      logger,
    });
    const loadPage = vi.fn(async () => ({
      threads: [thread("later", "2026-08-14T10:00:00.000Z")],
      nextPageToken: null,
    }));

    const second = await loadCombinedThreads({
      accounts: [account("account-1")],
      cursor: first.nextPageToken,
      limit: 1,
      loadPage,
      logger,
    });

    expect(loadPage).toHaveBeenCalledWith(
      expect.objectContaining({ pageToken: "next-provider-page" }),
    );
    expect(second.threads.map((item) => item.id)).toEqual(["later"]);
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
