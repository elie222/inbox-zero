import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ActionType,
  ExecutedRuleStatus,
  ScheduledActionStatus,
} from "@/generated/prisma/enums";
import { runActionFunction } from "@/utils/ai/actions";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { executeScheduledAction } from "./executor";

const logger = createTestLogger();
const failedScheduledActionReason = "One or more scheduled actions failed";

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
    vi.mocked(getEmailAccountWithAiAndTokens).mockResolvedValue(
      mockEmailAccount as any,
    );
    vi.mocked(runActionFunction).mockResolvedValue(undefined);
  });

  describe("executeScheduledAction", () => {
    it("should successfully execute action and mark as completed", async () => {
      mockScheduledActionUpdate(ScheduledActionStatus.COMPLETED);
      mockExecutedActionCreate();
      mockExecutedRuleFind();
      mockCompletionCounts({ pendingActions: 0, failedActions: 0 });
      mockExecutedRuleUpdate(ExecutedRuleStatus.APPLIED);

      const result = await executeScheduledAction(
        mockScheduledAction,
        await getMockEmailProvider(),
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
      expectExecutedRuleStatus(ExecutedRuleStatus.APPLIED);
    });

    it("forwards selectedAttachments into the executed action", async () => {
      const selectedAttachments = [
        {
          fileId: "drive-file-1",
          name: "proposal.pdf",
          mimeType: "application/pdf",
        },
      ];
      const scheduledActionWithAttachments = {
        ...mockScheduledAction,
        actionType: ActionType.REPLY,
        content: "Reply with attachment",
        selectedAttachments,
      };

      mockScheduledActionUpdate(
        ScheduledActionStatus.COMPLETED,
        scheduledActionWithAttachments,
      );
      mockExecutedActionCreate({
        type: ActionType.REPLY,
        content: "Reply with attachment",
        selectedAttachments,
      });
      mockExecutedRuleFind();
      mockCompletionCounts({ pendingActions: 0, failedActions: 0 });
      mockExecutedRuleUpdate(ExecutedRuleStatus.APPLIED);

      await executeScheduledAction(
        scheduledActionWithAttachments,
        await getMockEmailProvider(),
        logger,
      );

      expect(prisma.executedAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: ActionType.REPLY,
          content: "Reply with attachment",
          selectedAttachments,
        }),
      });
    });

    it("should complete the ExecutedRule when the email no longer exists", async () => {
      const emailProvider = await getMockEmailProvider();
      (emailProvider.getMessage as any).mockResolvedValueOnce(null);
      mockScheduledActionUpdate(ScheduledActionStatus.COMPLETED);
      mockCompletionCounts({ pendingActions: 0, failedActions: 0 });
      mockExecutedRuleUpdate(ExecutedRuleStatus.APPLIED);

      const result = await executeScheduledAction(
        mockScheduledAction,
        emailProvider,
        logger,
      );

      expect(result).toEqual({
        success: true,
        reason: "Email no longer exists",
      });
      expect(prisma.scheduledAction.update).toHaveBeenCalledWith({
        where: { id: "scheduled-action-123" },
        data: {
          status: ScheduledActionStatus.COMPLETED,
          executedAt: expect.any(Date),
          executedActionId: undefined,
        },
      });
      expectExecutedRuleStatus(ExecutedRuleStatus.APPLIED);
    });

    it("should handle execution errors and mark as failed", async () => {
      mockScheduledActionUpdate(ScheduledActionStatus.FAILED);
      mockExecutedActionCreate();
      mockExecutedRuleFind();
      mockCompletionCounts({ pendingActions: 0, failedActions: 1 });
      mockExecutedRuleUpdate(
        ExecutedRuleStatus.ERROR,
        failedScheduledActionReason,
      );
      vi.mocked(runActionFunction).mockRejectedValue(
        new Error("Execution failed"),
      );

      const result = await executeScheduledAction(
        mockScheduledAction,
        await getMockEmailProvider(),
        logger,
      );

      expect(result.success).toBe(false);
      expect(prisma.scheduledAction.update).toHaveBeenCalledWith({
        where: { id: "scheduled-action-123" },
        data: { status: ScheduledActionStatus.FAILED },
      });
      expectExecutedRuleStatus(
        ExecutedRuleStatus.ERROR,
        failedScheduledActionReason,
      );
    });

    it("should handle account not found errors", async () => {
      mockScheduledActionUpdate(ScheduledActionStatus.FAILED);
      mockCompletionCounts({ pendingActions: 0, failedActions: 1 });
      mockExecutedRuleUpdate(
        ExecutedRuleStatus.ERROR,
        failedScheduledActionReason,
      );
      vi.mocked(getEmailAccountWithAiAndTokens).mockResolvedValue(null);

      const result = await executeScheduledAction(
        mockScheduledAction,
        await getMockEmailProvider(),
        logger,
      );

      expect(result.success).toBe(false);
      expect(prisma.scheduledAction.update).toHaveBeenCalledWith({
        where: { id: "scheduled-action-123" },
        data: { status: ScheduledActionStatus.FAILED },
      });
      expectExecutedRuleStatus(
        ExecutedRuleStatus.ERROR,
        failedScheduledActionReason,
      );
    });

    it("should transition ExecutedRule to ERROR when some actions fail and others succeed", async () => {
      mockScheduledActionUpdate(ScheduledActionStatus.COMPLETED);
      mockExecutedActionCreate({ id: "executed-action-456" });
      mockExecutedRuleFind();
      mockCompletionCounts({ pendingActions: 0, failedActions: 2 });
      mockExecutedRuleUpdate(
        ExecutedRuleStatus.ERROR,
        failedScheduledActionReason,
      );

      const result = await executeScheduledAction(
        mockScheduledAction,
        await getMockEmailProvider(),
        logger,
      );

      expect(result.success).toBe(true);
      expectExecutedRuleStatus(
        ExecutedRuleStatus.ERROR,
        failedScheduledActionReason,
      );
    });

    it("should not update ExecutedRule status when actions are still pending", async () => {
      mockScheduledActionUpdate(ScheduledActionStatus.COMPLETED);
      mockExecutedActionCreate({ id: "executed-action-101" });
      mockExecutedRuleFind();
      mockCompletionCounts({ pendingActions: 2 });

      const result = await executeScheduledAction(
        mockScheduledAction,
        await getMockEmailProvider(),
        logger,
      );

      expect(result.success).toBe(true);
      expect(prisma.executedRule.update).not.toHaveBeenCalled();
    });
  });
});

const mockEmailAccount = {
  id: "account-123",
  userId: "user-123",
  email: "test@example.com",
  tokens: {
    access_token: "token",
    refresh_token: "refresh",
    expires_at: Date.now() + 3_600_000,
  },
};

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

async function getMockEmailProvider() {
  return createEmailProvider({
    emailAccountId: "account-123",
    provider: "google",
  });
}

function mockScheduledActionUpdate(
  status: ScheduledActionStatus,
  scheduledAction = mockScheduledAction,
) {
  prisma.scheduledAction.update.mockResolvedValue({
    ...scheduledAction,
    status,
  } as any);
}

function mockExecutedActionCreate(overrides = {}) {
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
    ...overrides,
  });
}

function mockExecutedRuleFind() {
  prisma.executedRule.findUnique.mockResolvedValue({
    id: "rule-123",
    createdAt: new Date(),
    updatedAt: new Date(),
    messageId: "msg-123",
    threadId: "thread-123",
    emailAccountId: "account-123",
    status: ExecutedRuleStatus.APPLYING,
    automated: true,
    reason: null,
    ruleId: null,
  } as any);
}

function mockCompletionCounts({
  pendingActions,
  failedActions = 0,
}: {
  pendingActions: number;
  failedActions?: number;
}) {
  prisma.scheduledAction.count.mockResolvedValueOnce(pendingActions);
  if (pendingActions === 0) {
    prisma.scheduledAction.count.mockResolvedValueOnce(failedActions);
  }
}

function mockExecutedRuleUpdate(
  status: ExecutedRuleStatus,
  reason: string | null = null,
) {
  prisma.executedRule.update.mockResolvedValue({
    id: "rule-123",
    createdAt: new Date(),
    updatedAt: new Date(),
    messageId: "msg-123",
    threadId: "thread-123",
    emailAccountId: "account-123",
    status,
    automated: true,
    reason,
    ruleId: null,
    matchMetadata: null,
  });
}

function expectExecutedRuleStatus(status: ExecutedRuleStatus, reason?: string) {
  expect(prisma.executedRule.update).toHaveBeenCalledWith({
    where: { id: "rule-123" },
    data: reason ? { status, reason } : { status },
  });
}
