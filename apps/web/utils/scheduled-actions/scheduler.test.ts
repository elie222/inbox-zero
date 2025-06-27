import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionType, ScheduledActionStatus } from "@prisma/client";
import { cancelScheduledActions } from "./scheduler";
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
      expect(canActionBeDelayed(ActionType.DRAFT_EMAIL)).toBe(true);
      expect(canActionBeDelayed(ActionType.CALL_WEBHOOK)).toBe(true);
    });

    it("should return false for unsupported actions", () => {
      expect(canActionBeDelayed(ActionType.MARK_SPAM)).toBe(false);
      expect(canActionBeDelayed(ActionType.TRACK_THREAD)).toBe(false);
      expect(canActionBeDelayed(ActionType.DIGEST)).toBe(false);
    });
  });

  describe("cancelScheduledActions", () => {
    it("should cancel scheduled actions for a message", async () => {
      // Mock finding actions to cancel
      prisma.scheduledAction.findMany.mockResolvedValue([
        { id: "action-1", qstashMessageId: "qstash-msg-1" },
        { id: "action-2", qstashMessageId: "qstash-msg-2" },
      ] as any);

      // Mock updating actions as cancelled
      prisma.scheduledAction.updateMany.mockResolvedValue({ count: 2 });

      const result = await cancelScheduledActions({
        messageId: "msg-123",
        emailAccountId: "account-123",
      });

      expect(prisma.scheduledAction.findMany).toHaveBeenCalledWith({
        where: {
          emailAccountId: "account-123",
          messageId: "msg-123",
          status: ScheduledActionStatus.PENDING,
        },
        select: {
          id: true,
          qstashMessageId: true,
        },
      });

      expect(prisma.scheduledAction.updateMany).toHaveBeenCalledWith({
        where: {
          emailAccountId: "account-123",
          messageId: "msg-123",
          status: ScheduledActionStatus.PENDING,
        },
        data: {
          status: ScheduledActionStatus.CANCELLED,
        },
      });

      expect(result).toBe(2);
    });

    it("should return zero when no actions to cancel", async () => {
      prisma.scheduledAction.findMany.mockResolvedValue([]);
      prisma.scheduledAction.updateMany.mockResolvedValue({ count: 0 });

      const result = await cancelScheduledActions({
        messageId: "msg-456",
        emailAccountId: "account-123",
      });

      expect(result).toBe(0);
    });

    it("should include threadId when provided", async () => {
      prisma.scheduledAction.findMany.mockResolvedValue([
        { id: "action-1", qstashMessageId: "qstash-msg-1" },
      ] as any);
      prisma.scheduledAction.updateMany.mockResolvedValue({ count: 1 });

      await cancelScheduledActions({
        messageId: "msg-123",
        emailAccountId: "account-123",
        threadId: "thread-123",
        reason: "Custom reason",
      });

      expect(prisma.scheduledAction.findMany).toHaveBeenCalledWith({
        where: {
          emailAccountId: "account-123",
          messageId: "msg-123",
          threadId: "thread-123",
          status: ScheduledActionStatus.PENDING,
        },
        select: {
          id: true,
          qstashMessageId: true,
        },
      });

      expect(prisma.scheduledAction.updateMany).toHaveBeenCalledWith({
        where: {
          emailAccountId: "account-123",
          messageId: "msg-123",
          threadId: "thread-123",
          status: ScheduledActionStatus.PENDING,
        },
        data: {
          status: ScheduledActionStatus.CANCELLED,
        },
      });
    });
  });
});
