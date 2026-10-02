import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { getRuleExecutionForMessageTool } from "./get-rule-execution-for-message-tool";

vi.mock("@/utils/prisma", () => ({
  default: { executedRule: { findMany: vi.fn() } },
}));
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("./shared", () => ({ trackRuleToolCall: vi.fn() }));

const execution = {
  id: "execution",
  ruleId: "rule",
  threadId: "thread",
  createdAt: new Date(),
  status: "APPLIED",
  reason: "Matched direct recipient rule",
  matchMetadata: null,
  automated: true,
  actionItems: [],
  rule: { id: "rule", name: "Urgent" },
};

describe("execution history message identity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves the provider's canonical ID before reporting missing history", async () => {
    vi.mocked(prisma.executedRule.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([execution] as never);
    const provider = createMockEmailProvider();
    vi.mocked(provider.getCanonicalMessageId).mockResolvedValue("immutable-id");
    vi.mocked(createEmailProvider).mockResolvedValue(provider);
    const result = await run();
    expect(result).toMatchObject({
      messageId: "immutable-id",
      evidence: { state: "RECORDED_EXECUTIONS" },
      executions: [{ executedRuleId: "execution" }],
    });
    expect(provider.getMessage).not.toHaveBeenCalled();
    expect(prisma.executedRule.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { emailAccountId: "account", messageId: "immutable-id" },
      }),
    );
  });

  it("avoids provider calls when the exact ID already has records", async () => {
    vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
      execution,
    ] as never);
    expect(await run()).toMatchObject({
      evidence: { state: "RECORDED_EXECUTIONS" },
    });
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("preserves missing evidence when the provider is unavailable", async () => {
    vi.mocked(prisma.executedRule.findMany).mockResolvedValue([]);
    vi.mocked(createEmailProvider).mockRejectedValue(
      new Error("Provider unavailable"),
    );
    expect(await run()).toMatchObject({
      evidence: { state: "NO_EXECUTION_RECORDS", rootCauseKnown: false },
      executions: [],
    });
    expect(prisma.executedRule.findMany).toHaveBeenCalledTimes(1);
  });

  it("does not hide a database error during the canonical-ID lookup", async () => {
    vi.mocked(prisma.executedRule.findMany)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("Database unavailable"));
    const provider = createMockEmailProvider();
    vi.mocked(provider.getCanonicalMessageId).mockResolvedValue("immutable-id");
    vi.mocked(createEmailProvider).mockResolvedValue(provider);
    expect(await run()).toMatchObject({
      error: "Failed to load rule execution for message",
    });
  });

  it("preserves missing evidence without substituting another message's thread history", async () => {
    vi.mocked(prisma.executedRule.findMany).mockResolvedValue([]);
    const provider = createMockEmailProvider();
    vi.mocked(provider.getCanonicalMessageId).mockResolvedValue("search-id");
    vi.mocked(createEmailProvider).mockResolvedValue(provider);
    expect(await run()).toMatchObject({
      evidence: { state: "NO_EXECUTION_RECORDS", rootCauseKnown: false },
      executions: [],
    });
    expect(prisma.executedRule.findMany).toHaveBeenCalledTimes(1);
  });
});

function run() {
  return getRuleExecutionForMessageTool({
    email: "user@example.com",
    emailAccountId: "account",
    provider: "microsoft",
    logger: createTestLogger(),
  }).execute!({ messageId: "search-id" }, { toolCallId: "call", messages: [] });
}
