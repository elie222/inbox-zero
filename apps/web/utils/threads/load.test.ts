import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { loadThreads, toListThreads } from "./load";

vi.mock("@/utils/prisma");

describe("loadThreads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.executedRule.findMany.mockResolvedValue([]);
  });

  it("omits threads when every message is from an ignored sender", async () => {
    const emailProvider = {
      getThreadsWithQuery: vi.fn().mockResolvedValue({
        threads: [
          {
            id: "ignored-thread",
            snippet: "Reminder",
            messages: [
              {
                id: "ignored-message",
                threadId: "ignored-thread",
                headers: {
                  from: "Reminder <reminder@superhuman.com>",
                },
              },
            ],
          },
        ],
        nextPageToken: null,
      }),
    };

    const result = await loadThreads({
      query: { type: "inbox" },
      emailAccountId: "account-1",
      emailProvider: emailProvider as never,
      messageFormat: "metadata",
    });

    expect(result.threads).toEqual([]);
  });

  it("keeps separate plans for executions whose rules were deleted", async () => {
    const emailProvider = {
      getThreadsWithQuery: vi.fn().mockResolvedValue({
        threads: [
          {
            id: "thread-1",
            snippet: "Thread",
            messages: [
              {
                id: "message-1",
                threadId: "thread-1",
                headers: { from: "sender@example.com" },
              },
            ],
          },
        ],
        nextPageToken: null,
      }),
    };
    prisma.executedRule.findMany.mockResolvedValue([
      executedRule("execution-2", new Date("2026-08-14T11:00:00.000Z")),
      executedRule("execution-1", new Date("2026-08-14T10:00:00.000Z")),
    ] as never);

    const result = await loadThreads({
      query: { type: "inbox" },
      emailAccountId: "account-1",
      emailProvider: emailProvider as never,
      messageFormat: "metadata",
    });

    const planIds = result.threads[0]?.plans.map((plan) => plan.id);
    expect(planIds).toHaveLength(2);
    expect(planIds).toEqual(
      expect.arrayContaining(["execution-1", "execution-2"]),
    );
  });

  it("keeps every provider message ID when ignored messages are hidden", async () => {
    const emailProvider = {
      getThreadsWithQuery: vi.fn().mockResolvedValue({
        threads: [
          {
            id: "thread-1",
            snippet: "Thread",
            messages: [
              {
                id: "visible-message",
                threadId: "thread-1",
                headers: { from: "sender@example.com" },
              },
              {
                id: "hidden-message",
                threadId: "thread-1",
                headers: { from: "Reminder <reminder@superhuman.com>" },
              },
            ],
          },
        ],
        nextPageToken: null,
      }),
    };

    const loaded = await loadThreads({
      query: { type: "inbox" },
      emailAccountId: "account-1",
      emailProvider: emailProvider as never,
      messageFormat: "metadata",
    });

    expect(loaded.threads[0]?.messages.map((message) => message.id)).toEqual([
      "visible-message",
    ]);
    expect(toListThreads(loaded).threads[0]?.messageIds).toEqual([
      "visible-message",
      "hidden-message",
    ]);
  });

  describe("multi-label splits", () => {
    const thread = (id: string, internalDate: string) => ({
      id,
      snippet: id,
      messages: [
        {
          id: `${id}-message`,
          threadId: id,
          internalDate,
          headers: { from: "sender@example.com" },
        },
      ],
    });

    it("queries each label separately and merges them newest-first", async () => {
      const emailProvider = {
        getThreadsWithQuery: vi.fn(async ({ query }) => ({
          threads: query.labelIds.includes("label-a")
            ? [thread("older", "1000")]
            : [thread("newer", "2000")],
          nextPageToken: null,
        })),
      };

      const result = await loadThreads({
        query: { labelIds: ["INBOX"], anyLabelIds: ["label-a", "label-b"] },
        emailAccountId: "account-1",
        emailProvider: emailProvider as never,
        messageFormat: "metadata",
      });

      expect(result.threads.map((loaded) => loaded.id)).toEqual([
        "newer",
        "older",
      ]);
      // Each label keeps the caller's own filters, so the split stays in the inbox.
      for (const [{ query }] of emailProvider.getThreadsWithQuery.mock.calls) {
        expect(query.anyLabelIds).toBeUndefined();
        expect(query.labelIds[0]).toBe("INBOX");
      }
    });

    it("returns a thread carrying several of the labels only once", async () => {
      const emailProvider = {
        getThreadsWithQuery: vi.fn().mockResolvedValue({
          threads: [thread("shared", "1000")],
          nextPageToken: null,
        }),
      };

      const result = await loadThreads({
        query: { labelIds: ["INBOX"], anyLabelIds: ["label-a", "label-b"] },
        emailAccountId: "account-1",
        emailProvider: emailProvider as never,
        messageFormat: "metadata",
      });

      expect(result.threads.map((loaded) => loaded.id)).toEqual(["shared"]);
      expect(result.nextPageToken).toBeUndefined();
    });

    it("re-serves rows a full page could not fit before advancing a label", async () => {
      const emailProvider = {
        getThreadsWithQuery: vi.fn(async ({ query }) => ({
          threads: query.labelIds.includes("label-a")
            ? [thread("a-newest", "3000"), thread("a-oldest", "1000")]
            : [thread("b-middle", "2000")],
          nextPageToken: "label-page-2",
        })),
      };
      const load = (nextPageToken?: string) =>
        loadThreads({
          query: {
            labelIds: ["INBOX"],
            anyLabelIds: ["label-a", "label-b"],
            limit: 2,
            nextPageToken,
          },
          emailAccountId: "account-1",
          emailProvider: emailProvider as never,
          messageFormat: "metadata",
        });

      const first = await load();
      expect(first.threads.map((loaded) => loaded.id)).toEqual([
        "a-newest",
        "b-middle",
      ]);

      const second = await load(first.nextPageToken ?? undefined);
      expect(second.threads.map((loaded) => loaded.id)).toContain("a-oldest");
    });

    it("fails the request rather than silently narrowing the split", async () => {
      const emailProvider = {
        getThreadsWithQuery: vi.fn(async ({ query }) => {
          if (query.labelIds.includes("label-b")) throw new Error("Boom");
          return { threads: [thread("only-a", "1000")], nextPageToken: null };
        }),
      };

      await expect(
        loadThreads({
          query: { labelIds: ["INBOX"], anyLabelIds: ["label-a", "label-b"] },
          emailAccountId: "account-1",
          emailProvider: emailProvider as never,
          messageFormat: "metadata",
        }),
      ).rejects.toThrow("Boom");
    });

    it("keeps a single label on the provider's own query", async () => {
      const emailProvider = {
        getThreadsWithQuery: vi.fn().mockResolvedValue({
          threads: [],
          nextPageToken: null,
        }),
      };

      await loadThreads({
        query: { labelIds: ["INBOX"], anyLabelIds: ["label-a"] },
        emailAccountId: "account-1",
        emailProvider: emailProvider as never,
        messageFormat: "metadata",
      });

      expect(emailProvider.getThreadsWithQuery).toHaveBeenCalledTimes(1);
      expect(
        emailProvider.getThreadsWithQuery.mock.calls[0][0].query.labelIds,
      ).toEqual(["INBOX", "label-a"]);
    });
  });
});

function executedRule(id: string, createdAt: Date) {
  return {
    id,
    messageId: `${id}-message`,
    threadId: "thread-1",
    rule: null,
    actionItems: [],
    status: "APPLIED",
    reason: null,
    createdAt,
  };
}
