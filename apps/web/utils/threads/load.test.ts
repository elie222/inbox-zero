import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { loadThreads } from "./load";

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

    expect(result.threads[0]?.plans.map((plan) => plan.id)).toEqual([
      "execution-2",
      "execution-1",
    ]);
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
