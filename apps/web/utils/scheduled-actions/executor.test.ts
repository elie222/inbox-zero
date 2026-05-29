import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionType, ScheduledActionStatus } from "@/generated/prisma/enums";
import { executeScheduledAction } from "./executor";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";

const logger = createTestLogger();

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
      staticAttachments: null,
      selectedAttachments: null,
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
        draftStatus: null,
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
        matchMetadata: null,
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
        logger,
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

    it("forwards selectedAttachments into the executed action", async () => {
      const scheduledActionWithAttachments = {
        ...mockScheduledAction,
        actionType: ActionType.REPLY,
        content: "Reply with attachment",
        selectedAttachments: [
          {
            fileId: "drive-file-1",
            name: "proposal.pdf",
            mimeType: "application/pdf",
          },
        ],
      };

      prisma.scheduledAction.update.mockResolvedValue({
        ...scheduledActionWithAttachments,
        status: ScheduledActionStatus.COMPLETED,
      } as any);
      prisma.executedAction.create.mockResolvedValue({
        id: "executed-action-123",
        type: ActionType.REPLY,
        label: null,
        labelId: null,
        folderName: null,
        folderId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        executedRuleId: "rule-123",
        subject: null,
        content: "Reply with attachment",
        to: null,
        cc: null,
        bcc: null,
        url: null,
        draftId: null,
        draftStatus: null,
        selectedAttachments: [
          {
            fileId: "drive-file-1",
            name: "proposal.pdf",
            mimeType: "application/pdf",
          },
        ],
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
        matchMetadata: null,
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

      await executeScheduledAction(
        scheduledActionWithAttachments,
        mockEmailProvider,
        logger,
      );

      expect(prisma.executedAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: ActionType.REPLY,
          content: "Reply with attachment",
          selectedAttachments: [
            {
              fileId: "drive-file-1",
              name: "proposal.pdf",
              mimeType: "application/pdf",
            },
          ],
        }),
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
        draftStatus: null,
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
      // pending=0, failed=1 → completion check runs and sets ERROR
      prisma.scheduledAction.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);
      prisma.executedRule.update.mockResolvedValue({
        id: "rule-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        messageId: "msg-123",
        threadId: "thread-123",
        emailAccountId: "account-123",
        status: "ERROR",
        automated: true,
        reason: "One or more scheduled actions failed",
        ruleId: null,
        matchMetadata: null,
      });

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
        logger,
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
      // pending=0, failed=1 → completion check sets ERROR
      prisma.scheduledAction.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);
      prisma.executedRule.update.mockResolvedValue({
        id: "rule-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        messageId: "msg-123",
        threadId: "thread-123",
        emailAccountId: "account-123",
        status: "ERROR",
        automated: true,
        reason: "One or more scheduled actions failed",
        ruleId: null,
        matchMetadata: null,
      });

      const { getEmailAccountWithAiAndTokens } = await import(
        "@/utils/user/get"
      );
      (getEmailAccountWithAiAndTokens as any).mockResolvedValue(null);

      const { createEmailProvider } = await import("@/utils/email/provider");
      const mockEmailProvider = await createEmailProvider({
        emailAccountId: "account-123",
        provider: "google",
      });

      await executeScheduledAction(
        mockScheduledAction,
        mockEmailProvider,
        logger,
      );

      expect(prisma.scheduledAction.update).toHaveBeenCalledWith({
        where: { id: "scheduled-action-123" },
        data: {
          status: ScheduledActionStatus.FAILED,
        },
      });
    });
    // @ana A001, A002, A003, A009, A010
    it("should transition ExecutedRule to ERROR when last action fails", async () => {
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
        draftStatus: null,
      });
      prisma.executedRule.findUnique.mockResolvedValue({
        id: "rule-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        messageId: "msg-123",
        threadId: "thread-123",
        emailAccountId: "account-123",
        status: "APPLYING",
        automated: true,
        reason: null,
        ruleId: null,
      } as any);
      // pending=0, failed=1 → should set ERROR
      prisma.scheduledAction.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);
      prisma.executedRule.update.mockResolvedValue({
        id: "rule-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        messageId: "msg-123",
        threadId: "thread-123",
        emailAccountId: "account-123",
        status: "ERROR",
        automated: true,
        reason: "One or more scheduled actions failed",
        ruleId: null,
        matchMetadata: null,
      });

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
        logger,
      );

      expect(result.success).toBe(false);
      expect(prisma.scheduledAction.update).toHaveBeenCalledWith({
        where: { id: "scheduled-action-123" },
        data: { status: ScheduledActionStatus.FAILED },
      });
      expect(prisma.scheduledAction.count).toHaveBeenCalled();
      expect(prisma.executedRule.update).toHaveBeenCalledWith({
        where: { id: "rule-123" },
        data: {
          status: "ERROR",
          reason: "One or more scheduled actions failed",
        },
      });
    });

    // @ana A004, A005
    it("should transition ExecutedRule to ERROR when some actions fail and others succeed", async () => {
      prisma.scheduledAction.update.mockResolvedValue({
        ...mockScheduledAction,
        status: ScheduledActionStatus.COMPLETED,
      } as any);
      prisma.executedAction.create.mockResolvedValue({
        id: "executed-action-456",
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
        draftStatus: null,
      });
      prisma.executedRule.findUnique.mockResolvedValue({
        id: "rule-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        messageId: "msg-123",
        threadId: "thread-123",
        emailAccountId: "account-123",
        status: "APPLYING",
        automated: true,
        reason: null,
        ruleId: null,
      } as any);
      // pending=0, failed=2 (siblings failed earlier) → should set ERROR
      prisma.scheduledAction.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(2);
      prisma.executedRule.update.mockResolvedValue({
        id: "rule-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        messageId: "msg-123",
        threadId: "thread-123",
        emailAccountId: "account-123",
        status: "ERROR",
        automated: true,
        reason: "One or more scheduled actions failed",
        ruleId: null,
        matchMetadata: null,
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
        logger,
      );

      expect(result.success).toBe(true);
      expect(prisma.executedRule.update).toHaveBeenCalledWith({
        where: { id: "rule-123" },
        data: {
          status: "ERROR",
          reason: "One or more scheduled actions failed",
        },
      });
    });

    // @ana A006, A007
    it("should transition ExecutedRule to APPLIED when all actions succeed", async () => {
      prisma.scheduledAction.update.mockResolvedValue({
        ...mockScheduledAction,
        status: ScheduledActionStatus.COMPLETED,
      } as any);
      prisma.executedAction.create.mockResolvedValue({
        id: "executed-action-789",
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
        draftStatus: null,
      });
      prisma.executedRule.findUnique.mockResolvedValue({
        id: "rule-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        messageId: "msg-123",
        threadId: "thread-123",
        emailAccountId: "account-123",
        status: "APPLYING",
        automated: true,
        reason: null,
        ruleId: null,
      } as any);
      // pending=0, failed=0 → should set APPLIED
      prisma.scheduledAction.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
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
        matchMetadata: null,
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
        logger,
      );

      expect(result.success).toBe(true);
      expect(prisma.executedRule.update).toHaveBeenCalledWith({
        where: { id: "rule-123" },
        data: { status: "APPLIED" },
      });
    });

    // @ana A008
    it("should not update ExecutedRule status when actions are still pending", async () => {
      prisma.scheduledAction.update.mockResolvedValue({
        ...mockScheduledAction,
        status: ScheduledActionStatus.COMPLETED,
      } as any);
      prisma.executedAction.create.mockResolvedValue({
        id: "executed-action-101",
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
        draftStatus: null,
      });
      prisma.executedRule.findUnique.mockResolvedValue({
        id: "rule-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        messageId: "msg-123",
        threadId: "thread-123",
        emailAccountId: "account-123",
        status: "APPLYING",
        automated: true,
        reason: null,
        ruleId: null,
      } as any);
      // pending=2 → should NOT update ExecutedRule
      prisma.scheduledAction.count.mockResolvedValueOnce(2);

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
        logger,
      );

      expect(result.success).toBe(true);
      expect(prisma.executedRule.update).not.toHaveBeenCalled();
    });
  });
});
