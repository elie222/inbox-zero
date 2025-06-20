import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionType, ScheduledActionStatus } from "@prisma/client";
import { executeScheduledAction } from "./executor";
import prisma from "@/utils/__mocks__/prisma";

// Run with: pnpm test utils/scheduled-actions/executor.test.ts

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/gmail/client", () => ({
  getGmailClientWithRefresh: vi.fn(),
}));
vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAiAndTokens: vi.fn(),
}));
vi.mock("@/utils/ai/choose-rule/execute", () => ({
  executeAct: vi.fn(),
}));
vi.mock("@/utils/gmail/message", () => ({
  getMessage: vi.fn(),
}));

describe("executor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("executeScheduledAction", () => {
    const mockScheduledAction = {
      id: "scheduled-action-123",
      executedRuleId: "rule-123",
      actionType: ActionType.ARCHIVE,
      messageId: "msg-123",
      threadId: "thread-123",
      emailAccountId: "account-123",
      scheduledFor: new Date("2024-01-01T12:00:00Z"),
      status: ScheduledActionStatus.PENDING,
      label: null,
      subject: null,
      content: null,
      to: null,
      cc: null,
      bcc: null,
      url: null,
      errorMessage: null,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      executedAt: null,
      executedActionId: null,
    };

    it("should successfully execute action and mark as completed", async () => {
      prisma.scheduledAction.update.mockResolvedValue({
        ...mockScheduledAction,
        status: ScheduledActionStatus.COMPLETED,
      });
      prisma.executedAction.create.mockResolvedValue({
        id: "executed-action-123",
        type: ActionType.ARCHIVE,
        label: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        executedRuleId: "rule-123",
        subject: null,
        content: null,
        to: null,
        cc: null,
        bcc: null,
        url: null,
        draftId: null,
        wasDraftSent: null,
      });
      prisma.scheduledAction.count.mockResolvedValue(0);
      prisma.executedRule.update.mockResolvedValue({
        id: "rule-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        messageId: "msg-123",
        threadId: "thread-123",
        emailAccountId: "account-123",
        status: "APPLIED",
        automated: true,
        reason: null,
        ruleId: null,
      });

      const { executeAct } = await import("@/utils/ai/choose-rule/execute");
      const { getEmailAccountWithAiAndTokens } = await import(
        "@/utils/user/get"
      );
      const { getGmailClientWithRefresh } = await import(
        "@/utils/gmail/client"
      );
      const { getMessage } = await import("@/utils/gmail/message");

      (executeAct as any).mockResolvedValue(undefined);
      (getEmailAccountWithAiAndTokens as any).mockResolvedValue({
        id: "account-123",
        userId: "user-123",
        email: "test@example.com",
        tokens: {
          access_token: "token",
          refresh_token: "refresh",
          expires_at: Date.now() + 3600000,
        },
      });
      (getMessage as any).mockResolvedValue({
        id: "msg-123",
        threadId: "thread-123",
      });
      (getGmailClientWithRefresh as any).mockResolvedValue({
        users: {
          messages: {
            get: vi.fn().mockResolvedValue({
              data: { id: "msg-123", threadId: "thread-123" },
            }),
          },
        },
      });

      const result = await executeScheduledAction(mockScheduledAction);

      expect(result.success).toBe(true);
      expect(prisma.scheduledAction.update).toHaveBeenCalledWith({
        where: { id: "scheduled-action-123" },
        data: {
          status: ScheduledActionStatus.COMPLETED,
          executedAt: expect.any(Date),
          executedActionId: "executed-action-123",
          errorMessage: null,
        },
      });
    });

    it("should handle execution errors and schedule retry", async () => {
      prisma.scheduledAction.update.mockResolvedValue({
        ...mockScheduledAction,
        status: ScheduledActionStatus.PENDING,
        retryCount: 1,
      });

      const { executeAct } = await import("@/utils/ai/choose-rule/execute");
      const { getEmailAccountWithAiAndTokens } = await import(
        "@/utils/user/get"
      );
      const { getGmailClientWithRefresh } = await import(
        "@/utils/gmail/client"
      );
      const { getMessage } = await import("@/utils/gmail/message");

      (executeAct as any).mockRejectedValue(new Error("Execution failed"));
      (getEmailAccountWithAiAndTokens as any).mockResolvedValue({
        id: "account-123",
        userId: "user-123",
        email: "test@example.com",
        tokens: {
          access_token: "token",
          refresh_token: "refresh",
          expires_at: Date.now() + 3600000,
        },
      });
      (getMessage as any).mockResolvedValue({
        id: "msg-123",
        threadId: "thread-123",
      });
      (getGmailClientWithRefresh as any).mockResolvedValue({
        users: {
          messages: {
            get: vi.fn().mockResolvedValue({
              data: { id: "msg-123", threadId: "thread-123" },
            }),
          },
        },
      });

      const result = await executeScheduledAction(mockScheduledAction);

      expect(result.success).toBe(false);
      expect(result.retry).toBe(true);
      expect(prisma.scheduledAction.update).toHaveBeenCalledWith({
        where: { id: "scheduled-action-123" },
        data: {
          status: ScheduledActionStatus.PENDING,
          scheduledFor: expect.any(Date),
          retryCount: { increment: 1 },
          errorMessage: "Retry scheduled: Execution failed",
        },
      });
    });

    it("should handle account not found errors", async () => {
      prisma.scheduledAction.update.mockResolvedValue({
        ...mockScheduledAction,
        status: ScheduledActionStatus.EXECUTING,
      });

      const { getEmailAccountWithAiAndTokens } = await import(
        "@/utils/user/get"
      );
      (getEmailAccountWithAiAndTokens as any).mockResolvedValue(null);

      await executeScheduledAction(mockScheduledAction);

      expect(prisma.scheduledAction.update).toHaveBeenCalledWith({
        where: { id: "scheduled-action-123" },
        data: {
          status: ScheduledActionStatus.FAILED,
          errorMessage: "[PERMANENT] Email account not found",
        },
      });
    });
  });
});
