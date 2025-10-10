import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionType, ScheduledActionStatus } from "@prisma/client";
import { executeScheduledAction } from "./executor";
import prisma from "@/utils/__mocks__/prisma";

// Run with: pnpm test utils/scheduled-actions/executor.test.ts

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAiAndTokens: vi.fn(),
}));
vi.mock("@/utils/ai/actions", () => ({
  runActionFunction: vi.fn(),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn().mockResolvedValue({
    getMessage: vi.fn().mockResolvedValue({
      id: "msg-123",
      threadId: "thread-123",
      headers: {},
      textPlain: "test content",
      textHtml: "<p>test content</p>",
      attachments: [],
      internalDate: "1234567890",
      snippet: "",
      historyId: "",
      inline: [],
      isReplyInThread: false,
      subject: "Test Subject",
      date: "2024-01-01T00:00:00Z",
    }),
  }),
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
      createdAt: new Date(),
      updatedAt: new Date(),
      executedAt: null,
      executedActionId: null,
    } as any;

    it("should successfully execute action and mark as completed", async () => {
      prisma.scheduledAction.update.mockResolvedValue({
        ...mockScheduledAction,
        status: ScheduledActionStatus.COMPLETED,
      } as any);
      prisma.executedAction.create.mockResolvedValue({
        id: "executed-action-123",
        type: ActionType.ARCHIVE,
        label: null,
        labelId: null,
        folderName: null,
        folderId: null,
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
      prisma.executedRule.findUnique.mockResolvedValue({
        id: "rule-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        messageId: "msg-123",
        threadId: "thread-123",
        emailAccountId: "account-123",
        status: "PENDING",
        automated: true,
        reason: null,
        ruleId: null,
      } as any);
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

      const { runActionFunction } = await import("@/utils/ai/actions");
      const { getEmailAccountWithAiAndTokens } = await import(
        "@/utils/user/get"
      );

      (runActionFunction as any).mockResolvedValue(undefined);
      (getEmailAccountWithAiAndTokens as any).mockResolvedValue({
        id: "account-123",
        userId: "user-123",
        email: "test@example.com",
        tokens: {
          access_token: "token",
          refresh_token: "refresh",
          expires_at: Date.now() + 3_600_000,
        },
      });

      const { createEmailProvider } = await import("@/utils/email/provider");
      const mockEmailProvider = await createEmailProvider({
        emailAccountId: "account-123",
        provider: "google",
      });

      const result = await executeScheduledAction(
        mockScheduledAction,
        mockEmailProvider,
      );

      expect(result.success).toBe(true);
      expect(prisma.scheduledAction.update).toHaveBeenCalledWith({
        where: { id: "scheduled-action-123" },
        data: {
          status: ScheduledActionStatus.COMPLETED,
          executedAt: expect.any(Date),
          executedActionId: "executed-action-123",
        },
      });
    });

    it("should handle execution errors and mark as failed", async () => {
      prisma.scheduledAction.update.mockResolvedValue({
        ...mockScheduledAction,
        status: ScheduledActionStatus.FAILED,
      } as any);
      prisma.executedAction.create.mockResolvedValue({
        id: "executed-action-123",
        type: ActionType.ARCHIVE,
        label: null,
        labelId: null,
        folderName: null,
        folderId: null,
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
      prisma.executedRule.findUnique.mockResolvedValue({
        id: "rule-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        messageId: "msg-123",
        threadId: "thread-123",
        emailAccountId: "account-123",
        status: "PENDING",
        automated: true,
        reason: null,
        ruleId: null,
      } as any);

      const { runActionFunction } = await import("@/utils/ai/actions");
      const { getEmailAccountWithAiAndTokens } = await import(
        "@/utils/user/get"
      );

      (runActionFunction as any).mockRejectedValue(
        new Error("Execution failed"),
      );
      (getEmailAccountWithAiAndTokens as any).mockResolvedValue({
        id: "account-123",
        userId: "user-123",
        email: "test@example.com",
        tokens: {
          access_token: "token",
          refresh_token: "refresh",
          expires_at: Date.now() + 3_600_000,
        },
      });

      const { createEmailProvider } = await import("@/utils/email/provider");
      const mockEmailProvider = await createEmailProvider({
        emailAccountId: "account-123",
        provider: "google",
      });

      const result = await executeScheduledAction(
        mockScheduledAction,
        mockEmailProvider,
      );

      expect(result.success).toBe(false);
      expect(prisma.scheduledAction.update).toHaveBeenCalledWith({
        where: { id: "scheduled-action-123" },
        data: {
          status: ScheduledActionStatus.FAILED,
        },
      });
    });

    it("should handle account not found errors", async () => {
      prisma.scheduledAction.update.mockResolvedValue({
        ...mockScheduledAction,
        status: ScheduledActionStatus.EXECUTING,
      } as any);

      const { getEmailAccountWithAiAndTokens } = await import(
        "@/utils/user/get"
      );
      (getEmailAccountWithAiAndTokens as any).mockResolvedValue(null);

      const { createEmailProvider } = await import("@/utils/email/provider");
      const mockEmailProvider = await createEmailProvider({
        emailAccountId: "account-123",
        provider: "google",
      });

      await executeScheduledAction(mockScheduledAction, mockEmailProvider);

      expect(prisma.scheduledAction.update).toHaveBeenCalledWith({
        where: { id: "scheduled-action-123" },
        data: {
          status: ScheduledActionStatus.FAILED,
        },
      });
    });
  });
});
