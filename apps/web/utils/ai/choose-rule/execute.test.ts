import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ActionType, ExecutedRuleStatus } from "@/generated/prisma/enums";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import { runActionFunction } from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/ai/actions", () => ({
  runActionFunction: vi.fn(),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    executedRule: {
      update: vi.fn(),
    },
  },
}));

describe("executeAct", () => {
  const logger = createScopedLogger("test");
  const mockClient = {} as EmailProvider;
  const message: ParsedMessage = {
    id: "message-id-1",
    threadId: "thread-id-1",
    snippet: "",
    historyId: "history-id-1",
    inline: [],
    headers: {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Subject",
      date: "Mon, 1 Jan 2026 12:00:00 +0000",
      "message-id": "<message-id-1>",
    },
    subject: "Subject",
    date: "2026-01-01T12:00:00.000Z",
    internalDate: "1700000000000",
  };

  const baseExecutedRule = {
    id: "executed-rule-1",
    ruleId: "rule-1",
    threadId: "thread-id-1",
    messageId: "message-id-1",
    emailAccountId: "email-account-1",
    automated: true,
    reason: "Rule matched",
    createdAt: new Date("2026-01-01T12:00:00.000Z"),
    updatedAt: new Date("2026-01-01T12:00:00.000Z"),
    status: ExecutedRuleStatus.APPLYING,
  };

  const mockRunActionFunction = runActionFunction as Mock;
  const mockExecutedRuleUpdate = prisma.executedRule.update as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecutedRuleUpdate.mockResolvedValue({});
  });

  it("marks executed rule as ERROR when notify sender reports a failure", async () => {
    mockRunActionFunction.mockResolvedValueOnce({
      success: false,
      errorCode: "RESEND_NOT_CONFIGURED",
    });

    const executedRule = {
      ...baseExecutedRule,
      actionItems: [{ id: "action-1", type: ActionType.NOTIFY_SENDER }],
    } as any;

    await executeAct({
      client: mockClient,
      executedRule,
      message,
      userEmail: "recipient@example.com",
      userId: "user-1",
      emailAccountId: "email-account-1",
      logger,
    });

    expect(mockExecutedRuleUpdate).toHaveBeenCalledTimes(1);
    expect(mockExecutedRuleUpdate).toHaveBeenCalledWith({
      where: { id: "executed-rule-1" },
      data: {
        status: ExecutedRuleStatus.ERROR,
        reason:
          "Rule matched\nAction failures: NOTIFY_SENDER:RESEND_NOT_CONFIGURED",
      },
    });
  });

  it("marks executed rule as APPLIED when actions succeed", async () => {
    mockRunActionFunction.mockResolvedValueOnce({ success: true });

    const executedRule = {
      ...baseExecutedRule,
      actionItems: [{ id: "action-1", type: ActionType.NOTIFY_SENDER }],
    } as any;

    await executeAct({
      client: mockClient,
      executedRule,
      message,
      userEmail: "recipient@example.com",
      userId: "user-1",
      emailAccountId: "email-account-1",
      logger,
    });

    expect(mockExecutedRuleUpdate).toHaveBeenCalledTimes(1);
    expect(mockExecutedRuleUpdate).toHaveBeenCalledWith({
      where: { id: "executed-rule-1" },
      data: { status: ExecutedRuleStatus.APPLIED },
    });
  });

  it("keeps throwing for unexpected action exceptions", async () => {
    mockRunActionFunction.mockRejectedValueOnce(new Error("boom"));

    const executedRule = {
      ...baseExecutedRule,
      actionItems: [{ id: "action-1", type: ActionType.LABEL }],
    } as any;

    await expect(
      executeAct({
        client: mockClient,
        executedRule,
        message,
        userEmail: "recipient@example.com",
        userId: "user-1",
        emailAccountId: "email-account-1",
        logger,
      }),
    ).rejects.toThrow("boom");

    expect(mockExecutedRuleUpdate).toHaveBeenCalledTimes(1);
    expect(mockExecutedRuleUpdate).toHaveBeenCalledWith({
      where: { id: "executed-rule-1" },
      data: { status: ExecutedRuleStatus.ERROR },
    });
  });
});
