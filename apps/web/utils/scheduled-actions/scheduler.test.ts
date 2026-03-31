import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionType, ScheduledActionStatus } from "@/generated/prisma/enums";
import {
  cancelAwaitingConfirmationScheduledAction,
  cancelScheduledActions,
  markAwaitingConfirmationActionAsExecuting,
  markScheduledActionAwaitingConfirmation,
  revertScheduledActionAwaitingConfirmation,
} from "./scheduler";
import { canActionBeDelayed } from "@/utils/delayed-actions";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
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
            status: {
              in: [
                ScheduledActionStatus.PENDING,
                ScheduledActionStatus.AWAITING_CONFIRMATION,
              ],
            },
            executedRule: { ruleId: "rule-123" },
          }),
        }),
      );
      expect(prisma.scheduledAction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            emailAccountId: "account-123",
            messageId: "msg-123",
            status: {
              in: [
                ScheduledActionStatus.PENDING,
                ScheduledActionStatus.AWAITING_CONFIRMATION,
              ],
            },
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

  describe("approval status transitions", () => {
    it("marks a pending action as awaiting confirmation", async () => {
      prisma.scheduledAction.updateMany.mockResolvedValue({ count: 1 } as any);

      const result = await markScheduledActionAwaitingConfirmation("action-1");

      expect(result).toBe(true);
      expect(prisma.scheduledAction.updateMany).toHaveBeenCalledWith({
        where: {
          id: "action-1",
          status: ScheduledActionStatus.PENDING,
        },
        data: {
          status: ScheduledActionStatus.AWAITING_CONFIRMATION,
        },
      });
    });

    it("reverts an awaiting-confirmation action back to pending", async () => {
      prisma.scheduledAction.updateMany.mockResolvedValue({ count: 1 } as any);

      const result =
        await revertScheduledActionAwaitingConfirmation("action-1");

      expect(result).toBe(true);
      expect(prisma.scheduledAction.updateMany).toHaveBeenCalledWith({
        where: {
          id: "action-1",
          status: ScheduledActionStatus.AWAITING_CONFIRMATION,
        },
        data: {
          status: ScheduledActionStatus.PENDING,
        },
      });
    });

    it("marks an awaiting-confirmation action as executing", async () => {
      prisma.scheduledAction.updateMany.mockResolvedValue({ count: 1 } as any);

      const result =
        await markAwaitingConfirmationActionAsExecuting("action-1");

      expect(result).toBe(true);
      expect(prisma.scheduledAction.updateMany).toHaveBeenCalledWith({
        where: {
          id: "action-1",
          status: ScheduledActionStatus.AWAITING_CONFIRMATION,
        },
        data: {
          status: ScheduledActionStatus.EXECUTING,
        },
      });
    });

    it("cancels an awaiting-confirmation action", async () => {
      prisma.scheduledAction.updateMany.mockResolvedValue({ count: 1 } as any);

      const result =
        await cancelAwaitingConfirmationScheduledAction("action-1");

      expect(result).toBe(true);
      expect(prisma.scheduledAction.updateMany).toHaveBeenCalledWith({
        where: {
          id: "action-1",
          status: ScheduledActionStatus.AWAITING_CONFIRMATION,
        },
        data: {
          status: ScheduledActionStatus.CANCELLED,
        },
      });
    });
  });
});
