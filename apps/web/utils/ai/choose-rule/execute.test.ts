import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { ActionType, ExecutedRuleStatus } from "@/generated/prisma/enums";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import { runActionFunction } from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import { createTestLogger } from "@/__tests__/helpers";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    WHITELIST_FROM: undefined as string | undefined,
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/ai/actions", () => ({
  runActionFunction: vi.fn(),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    executedAction: {
      update: vi.fn(),
    },
    executedRule: {
      update: vi.fn(),
    },
  },
}));

describe("executeAct", () => {
  const logger = createTestLogger();
  const mockClient = {} as EmailProvider;
  const emailAccount = {
    email: "recipient@example.com",
    id: "email-account-1",
    userId: "user-1",
  };
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
  const mockExecutedActionUpdate = prisma.executedAction.update as Mock;
  const mockExecutedRuleUpdate = prisma.executedRule.update as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    envMock.WHITELIST_FROM = undefined;
    mockExecutedActionUpdate.mockResolvedValue({});
    mockExecutedRuleUpdate.mockResolvedValue({});
  });

  it("persists provider message IDs returned by sending actions", async () => {
    mockRunActionFunction.mockResolvedValueOnce({
      sentMessageIds: ["sent-message-1"],
    });
    const executedRule = {
      ...baseExecutedRule,
      actionItems: [{ id: "action-1", type: ActionType.REPLY }],
    } as any;

    await executeAct({
      client: mockClient,
      executedRule,
      message,
      emailAccount,
      logger,
    });

    expect(mockExecutedActionUpdate).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: {
        executionStatus: "SUCCEEDED",
        executedAt: expect.any(Date),
        executionError: Prisma.DbNull,
        sentMessageIds: ["sent-message-1"],
      },
    });
  });

  it("keeps labels but skips archive for protected company senders", async () => {
    envMock.WHITELIST_FROM = "onboarding@getinboxzero.com";
    mockRunActionFunction.mockResolvedValueOnce({ success: true });

    const executedRule = {
      ...baseExecutedRule,
      actionItems: [
        { id: "action-1", type: ActionType.LABEL, label: "Marketing" },
        { id: "action-2", type: ActionType.ARCHIVE },
      ],
    } as any;

    const result = await executeAct({
      client: mockClient,
      executedRule,
      message: {
        ...message,
        headers: {
          ...message.headers,
          from: "Inbox Zero <onboarding@getinboxzero.com>",
        },
      },
      emailAccount,
      logger,
    });

    expect(result).toBe(ExecutedRuleStatus.APPLIED);
    expect(mockRunActionFunction).toHaveBeenCalledTimes(1);
    expect(mockRunActionFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          id: "action-1",
          type: ActionType.LABEL,
        }),
      }),
    );
    expect(mockExecutedActionUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "action-1" },
      data: {
        executionStatus: "SUCCEEDED",
        executedAt: expect.any(Date),
        executionError: Prisma.DbNull,
      },
    });
    expect(mockExecutedActionUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "action-2" },
      data: {
        executionStatus: "SKIPPED",
        executedAt: expect.any(Date),
        executionError: Prisma.DbNull,
      },
    });
    expect(mockExecutedRuleUpdate).toHaveBeenCalledWith({
      where: { id: "executed-rule-1" },
      data: { status: ExecutedRuleStatus.APPLIED },
    });
  });

  it("records actions skipped by the executor without failing the rule", async () => {
    mockRunActionFunction.mockResolvedValueOnce({
      skipped: true,
      reason: "NO_NEW_FORWARD_RECIPIENTS",
    });

    const executedRule = {
      ...baseExecutedRule,
      actionItems: [{ id: "action-1", type: ActionType.FORWARD }],
    } as any;

    const result = await executeAct({
      client: mockClient,
      executedRule,
      message,
      emailAccount,
      logger,
    });

    expect(result).toBe(ExecutedRuleStatus.APPLIED);
    expect(mockExecutedActionUpdate).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: {
        executionStatus: "SKIPPED",
        executedAt: expect.any(Date),
        executionError: Prisma.DbNull,
      },
    });
    expect(mockExecutedRuleUpdate).toHaveBeenCalledWith({
      where: { id: "executed-rule-1" },
      data: { status: ExecutedRuleStatus.APPLIED },
    });
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

    const result = await executeAct({
      client: mockClient,
      executedRule,
      message,
      emailAccount,
      logger,
    });

    expect(result).toBe(ExecutedRuleStatus.ERROR);
    expect(mockExecutedRuleUpdate).toHaveBeenCalledTimes(1);
    expect(mockExecutedRuleUpdate).toHaveBeenCalledWith({
      where: { id: "executed-rule-1" },
      data: {
        status: ExecutedRuleStatus.ERROR,
        reason:
          "Rule matched\nAction failures: NOTIFY_SENDER:RESEND_NOT_CONFIGURED",
      },
    });
    expect(mockExecutedActionUpdate).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: {
        executionStatus: "FAILED",
        executedAt: expect.any(Date),
        executionError: {
          code: "RESEND_NOT_CONFIGURED",
          message: "Action reported failure",
          stack: null,
          statusCode: null,
          requestId: null,
        },
      },
    });
  });

  it("keeps the rule APPLIED when an action skips itself on purpose", async () => {
    mockRunActionFunction.mockResolvedValueOnce({ skipped: true });

    const executedRule = {
      ...baseExecutedRule,
      actionItems: [{ id: "action-1", type: ActionType.NOTIFY_SENDER }],
    } as any;

    const result = await executeAct({
      client: mockClient,
      executedRule,
      message,
      emailAccount,
      logger,
    });

    expect(result).toBe(ExecutedRuleStatus.APPLIED);
    expect(mockExecutedActionUpdate).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: {
        executionStatus: "SKIPPED",
        executedAt: expect.any(Date),
        executionError: Prisma.DbNull,
      },
    });
  });

  it("continues later messaging notifications after one delivery failure", async () => {
    mockRunActionFunction
      .mockResolvedValueOnce({
        success: false,
        errorCode: "MESSAGING_DELIVERY_FAILED",
      })
      .mockResolvedValueOnce({ success: true });

    const executedRule = {
      ...baseExecutedRule,
      actionItems: [
        {
          id: "telegram-action",
          type: ActionType.NOTIFY_MESSAGING_CHANNEL,
          messagingChannelId: "telegram-channel",
        },
        {
          id: "slack-action",
          type: ActionType.NOTIFY_MESSAGING_CHANNEL,
          messagingChannelId: "slack-channel",
        },
      ],
    } as any;

    const result = await executeAct({
      client: mockClient,
      executedRule,
      message,
      emailAccount,
      logger,
    });

    expect(result).toBe(ExecutedRuleStatus.ERROR);
    expect(mockRunActionFunction).toHaveBeenCalledTimes(2);
    expect(mockRunActionFunction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: expect.objectContaining({ id: "telegram-action" }),
      }),
    );
    expect(mockRunActionFunction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: expect.objectContaining({ id: "slack-action" }),
      }),
    );
    expect(mockExecutedRuleUpdate).toHaveBeenCalledTimes(1);
    expect(mockExecutedRuleUpdate).toHaveBeenCalledWith({
      where: { id: "executed-rule-1" },
      data: {
        status: ExecutedRuleStatus.ERROR,
        reason:
          "Rule matched\nAction failures: NOTIFY_MESSAGING_CHANNEL:MESSAGING_DELIVERY_FAILED",
      },
    });
  });

  it("marks executed rule as APPLIED when actions succeed", async () => {
    mockRunActionFunction.mockResolvedValueOnce({ success: true });

    const executedRule = {
      ...baseExecutedRule,
      actionItems: [{ id: "action-1", type: ActionType.NOTIFY_SENDER }],
    } as any;

    const result = await executeAct({
      client: mockClient,
      executedRule,
      message,
      emailAccount,
      logger,
    });

    expect(result).toBe(ExecutedRuleStatus.APPLIED);
    expect(mockExecutedRuleUpdate).toHaveBeenCalledTimes(1);
    expect(mockExecutedRuleUpdate).toHaveBeenCalledWith({
      where: { id: "executed-rule-1" },
      data: { status: ExecutedRuleStatus.APPLIED },
    });
  });

  it("does not report APPLIED when persisting the final status fails", async () => {
    mockRunActionFunction.mockResolvedValueOnce({ success: true });
    mockExecutedRuleUpdate.mockRejectedValueOnce(new Error("db unavailable"));

    const executedRule = {
      ...baseExecutedRule,
      actionItems: [{ id: "action-1", type: ActionType.NOTIFY_SENDER }],
    } as any;

    await expect(
      executeAct({
        client: mockClient,
        executedRule,
        message,
        emailAccount,
        logger,
      }),
    ).rejects.toThrow("db unavailable");

    expect(mockExecutedRuleUpdate).toHaveBeenCalledWith({
      where: { id: "executed-rule-1" },
      data: { status: ExecutedRuleStatus.APPLIED },
    });
  });

  it("keeps throwing for unexpected action exceptions", async () => {
    const graphError = Object.assign(new Error("Graph move failed"), {
      code: "ErrorMoveCopyFailed",
      statusCode: 503,
      requestId: "graph-request-123",
    });
    mockRunActionFunction.mockRejectedValueOnce(graphError);

    const executedRule = {
      ...baseExecutedRule,
      actionItems: [{ id: "action-1", type: ActionType.LABEL }],
    } as any;

    await expect(
      executeAct({
        client: mockClient,
        executedRule,
        message,
        emailAccount,
        logger,
      }),
    ).rejects.toThrow("Graph move failed");

    expect(mockExecutedRuleUpdate).toHaveBeenCalledTimes(1);
    expect(mockExecutedRuleUpdate).toHaveBeenCalledWith({
      where: { id: "executed-rule-1" },
      data: { status: ExecutedRuleStatus.ERROR },
    });
    expect(mockExecutedActionUpdate).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: {
        executionStatus: "FAILED",
        executedAt: expect.any(Date),
        executionError: {
          code: "ErrorMoveCopyFailed",
          message: "Graph move failed",
          stack: expect.stringContaining("Graph move failed"),
          statusCode: 503,
          requestId: "graph-request-123",
        },
      },
    });
  });
});
