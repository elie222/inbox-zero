import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionType, ScheduledActionStatus } from "@/generated/prisma/enums";
import { cancelScheduledActions, createScheduledAction } from "./scheduler";
import { canActionBeDelayed } from "@/utils/delayed-actions";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({
  env: {
    QSTASH_TOKEN: "",
  },
}));
vi.mock("@/utils/upstash", () => ({
  qstash: {
    messages: {
      delete: vi.fn().mockResolvedValue({}),
    },
  },
}));

describe("scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("canActionBeDelayed", () => {
    it("should return true for supported actions", () => {
      expect(canActionBeDelayed(ActionType.ARCHIVE)).toBe(true);
      expect(canActionBeDelayed(ActionType.LABEL)).toBe(true);
      expect(canActionBeDelayed(ActionType.MARK_READ)).toBe(true);
      expect(canActionBeDelayed(ActionType.REPLY)).toBe(true);
      expect(canActionBeDelayed(ActionType.SEND_EMAIL)).toBe(true);
      expect(canActionBeDelayed(ActionType.FORWARD)).toBe(true);
    });

    it("should return false for unsupported actions", () => {
      expect(canActionBeDelayed(ActionType.CALL_WEBHOOK)).toBe(false);
      expect(canActionBeDelayed(ActionType.DRAFT_EMAIL)).toBe(false);
      expect(canActionBeDelayed(ActionType.MARK_SPAM)).toBe(false);
      expect(canActionBeDelayed(ActionType.DIGEST)).toBe(false);
    });
  });

  describe("cancelScheduledActions", () => {
    it("should cancel scheduled actions for a specific rule", async () => {
      prisma.scheduledAction.findMany.mockResolvedValue([
        { id: "action-1", scheduledId: "qstash-msg-1" },
        { id: "action-2", scheduledId: "qstash-msg-2" },
      ] as any);
      prisma.scheduledAction.updateMany.mockResolvedValue({ count: 2 });

      const result = await cancelScheduledActions({
        messageId: "msg-123",
        emailAccountId: "account-123",
        ruleId: "rule-123",
      });

      expect(result).toBe(2);
      expect(prisma.scheduledAction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            emailAccountId: "account-123",
            messageId: "msg-123",
            status: ScheduledActionStatus.PENDING,
            executedRule: { ruleId: "rule-123" },
          }),
        }),
      );
      expect(prisma.scheduledAction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            emailAccountId: "account-123",
            messageId: "msg-123",
            status: ScheduledActionStatus.PENDING,
            executedRule: { ruleId: "rule-123" },
          }),
          data: { status: ScheduledActionStatus.CANCELLED },
        }),
      );
    });

    it("should return zero when no actions to cancel", async () => {
      prisma.scheduledAction.findMany.mockResolvedValue([]);
      prisma.scheduledAction.updateMany.mockResolvedValue({ count: 0 });

      const result = await cancelScheduledActions({
        messageId: "msg-456",
        emailAccountId: "account-123",
        ruleId: "rule-456",
      });

      expect(result).toBe(0);
    });

    it("should include threadId when provided", async () => {
      prisma.scheduledAction.findMany.mockResolvedValue([
        { id: "action-1", scheduledId: "qstash-msg-1" },
      ] as any);
      prisma.scheduledAction.updateMany.mockResolvedValue({ count: 1 });

      await cancelScheduledActions({
        messageId: "msg-123",
        emailAccountId: "account-123",
        threadId: "thread-123",
        ruleId: "rule-123",
        reason: "Custom reason",
      });

      expect(prisma.scheduledAction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ threadId: "thread-123" }),
        }),
      );
      expect(prisma.scheduledAction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ threadId: "thread-123" }),
        }),
      );
    });
  });

  describe("createScheduledAction", () => {
    it("persists selectedAttachments for delayed actions", async () => {
      prisma.scheduledAction.create.mockResolvedValue({
        id: "scheduled-action-123",
      } as any);

      await createScheduledAction({
        executedRuleId: "rule-123",
        messageId: "msg-123",
        threadId: "thread-123",
        emailAccountId: "account-123",
        scheduledFor: new Date("2026-05-02T10:00:00.000Z"),
        actionItem: {
          type: ActionType.REPLY,
          delayInMinutes: 15,
          content: "Follow up",
          selectedAttachments: [
            {
              fileId: "drive-file-1",
              name: "proposal.pdf",
              mimeType: "application/pdf",
            },
          ],
        },
      });

      expect(prisma.scheduledAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          executedRuleId: "rule-123",
          actionType: ActionType.REPLY,
          messageId: "msg-123",
          threadId: "thread-123",
          emailAccountId: "account-123",
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
  });
});
