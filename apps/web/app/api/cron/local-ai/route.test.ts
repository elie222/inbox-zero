import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { ActionType } from "@/generated/prisma/enums";

const {
  provider,
  runRulesMock,
  tagBackfillBatchMock,
  gmailList,
  categorizeSenderMock,
} = vi.hoisted(() => ({
  provider: {
    getMessage: vi.fn(),
    isSentMessage: vi.fn(),
    getMessagesWithPagination: vi.fn(),
  },
  runRulesMock: vi.fn(),
  tagBackfillBatchMock: vi.fn(),
  gmailList: vi.fn(),
  categorizeSenderMock: vi.fn(),
}));
vi.mock("@/utils/email-account-client", () => ({
  getGmailClientForEmail: async () => ({
    users: { messages: { list: gmailList } },
  }),
}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/internal-api", () => ({
  isValidInternalApiKey: (headers: Headers) =>
    headers.get("x-api-key") === "test",
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: async () => provider,
}));
vi.mock("@/utils/ai/choose-rule/run-rules", () => ({ runRules: runRulesMock }));
vi.mock("@/utils/ai/choose-rule/batch-tagging", () => ({
  tagBackfillBatch: tagBackfillBatchMock,
}));
vi.mock("@/utils/rule/rule", () => ({ upsertSystemRule: vi.fn() }));
vi.mock("@/utils/categorize/senders/categorize", () => ({
  categorizeSender: categorizeSenderMock,
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");
  return createWithErrorTestMiddleware();
});

import { POST } from "./route";

function request(key = "test") {
  return new Request("http://localhost:3000/api/cron/local-ai", {
    method: "POST",
    headers: { "x-api-key": key },
    body: JSON.stringify({
      operation: "process",
      emailAccountId: "account",
      messageId: "message",
    }),
  });
}

describe("local AI processing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: "account",
      account: { provider: "google", disconnectedAt: null },
      autoCategorizeSenders: false,
    } as never);
    prisma.executedRule.findFirst.mockResolvedValue(null);
    provider.getMessage.mockResolvedValue({
      id: "message",
      threadId: "thread",
      headers: { from: "sender@example.com" },
      internalDate: String(Date.now()),
    });
    provider.isSentMessage.mockReturnValue(false);
    runRulesMock.mockResolvedValue([{ status: "APPLIED" }]);
  });
  it("rejects requests without the internal credential before touching mailbox data", async () => {
    const response = await POST(request("wrong"));
    expect(response.status).toBe(401);
    expect(prisma.emailAccount.findUnique).not.toHaveBeenCalled();
  });
  it.each([
    "scan",
    "arrivals",
  ])("preserves Outlook ISO arrival times during %s instead of putting new mail in the old backlog", async (operation) => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: "account",
      account: { provider: "microsoft", disconnectedAt: null },
    } as never);
    provider.getMessagesWithPagination.mockResolvedValue({
      messages: [
        {
          id: "outlook-new",
          threadId: "thread",
          internalDate: "2026-10-26T02:18:00.000Z",
        },
        {
          id: "numeric-date",
          threadId: "thread-2",
          internalDate: "1792980660000",
        },
      ],
    });
    const response = await POST(
      new Request("http://localhost:3000/api/cron/local-ai", {
        method: "POST",
        headers: { "x-api-key": "test" },
        body: JSON.stringify({
          operation,
          emailAccountId: "account",
          after: 1_792_970_000_000,
        }),
      }),
    );
    expect(await response.json()).toMatchObject({
      messages: [
        {
          id: "outlook-new",
          receivedAt: Date.parse("2026-10-26T02:18:00.000Z"),
        },
        { id: "numeric-date", receivedAt: 1_792_980_660_000 },
      ],
    });
  });
  it("discovers new Gmail IDs without downloading bodies or using AI", async () => {
    gmailList.mockResolvedValue({
      data: { messages: [{ id: "fresh", threadId: "thread" }] },
    });
    const response = await POST(
      new Request("http://localhost:3000/api/cron/local-ai", {
        method: "POST",
        headers: { "x-api-key": "test" },
        body: JSON.stringify({
          operation: "arrivals",
          emailAccountId: "account",
          after: 1_700_000_000_000,
        }),
      }),
    );
    expect(await response.json()).toMatchObject({
      messages: [{ id: "fresh", threadId: "thread" }],
      nextCursor: null,
    });
    expect(gmailList).toHaveBeenCalledWith(
      expect.objectContaining({
        maxResults: 100,
        q: expect.stringContaining("after:"),
      }),
      expect.any(Object),
    );
    expect(provider.getMessage).not.toHaveBeenCalled();
    expect(runRulesMock).not.toHaveBeenCalled();
  });
  it("applies message rules before optional sender learning", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: "account",
      account: { provider: "google", disconnectedAt: null },
      autoCategorizeSenders: true,
    } as never);
    prisma.rule.findMany.mockResolvedValue([]);
    prisma.newsletter.findFirst.mockResolvedValue(null);
    await POST(request());
    expect(runRulesMock.mock.invocationCallOrder[0]).toBeLessThan(
      categorizeSenderMock.mock.invocationCallOrder[0],
    );
  });
  it("uses batch tagging without running the per-email drafting pipeline", async () => {
    const messageIds = Array.from({ length: 10 }, (_, i) => `mail-${i}`);
    tagBackfillBatchMock.mockResolvedValue({
      processedIds: messageIds,
      failedIds: [],
      aiBatchSize: 10,
    });
    const response = await POST(
      new Request("http://localhost:3000/api/cron/local-ai", {
        method: "POST",
        headers: { "x-api-key": "test" },
        body: JSON.stringify({
          operation: "tag-batch",
          emailAccountId: "account",
          messageIds,
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      processedIds: messageIds,
      aiBatchSize: 10,
    });
    expect(tagBackfillBatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ messageIds }),
    );
    expect(runRulesMock).not.toHaveBeenCalled();
  });
  it("does not process an already completed message again", async () => {
    prisma.executedRule.findFirst.mockResolvedValue({ id: "done" } as never);
    const response = await POST(request());
    expect(await response.json()).toMatchObject({
      existing: true,
      processed: true,
    });
    expect(provider.getMessage).not.toHaveBeenCalled();
    expect(runRulesMock).not.toHaveBeenCalled();
  });
  it("runs only label and draft actions and disables drafts for old catch-up mail", async () => {
    provider.getMessage.mockResolvedValue({
      id: "message",
      threadId: "thread",
      headers: { from: "sender@example.com" },
      internalDate: String(Date.now() - 30 * 86_400_000),
    });
    prisma.rule.findMany.mockResolvedValue([
      {
        id: "mixed",
        actions: [
          { type: ActionType.LABEL },
          { type: ActionType.DRAFT_EMAIL },
          { type: ActionType.REPLY },
          { type: ActionType.ARCHIVE },
        ],
      },
      { id: "blocked", actions: [{ type: ActionType.REPLY }] },
    ] as never);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(runRulesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isTest: false,
        skipArchive: true,
        skipDraftReplies: true,
        rules: [
          expect.objectContaining({
            id: "mixed",
            actions: [
              { type: ActionType.LABEL },
              { type: ActionType.DRAFT_EMAIL },
            ],
          }),
        ],
      }),
    );
  });
});
