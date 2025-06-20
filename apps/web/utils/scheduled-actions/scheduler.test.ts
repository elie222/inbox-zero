import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionType, ScheduledActionStatus } from "@prisma/client";
import { cancelScheduledActions } from "./scheduler";
import { isSupportedDelayedAction } from "@/utils/delayed-actions";
import type { ActionItem } from "@/utils/ai/types";
import prisma from "@/utils/__mocks__/prisma";

// Run with: pnpm test utils/scheduled-actions/scheduler.test.ts

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

describe("scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isSupportedDelayedAction", () => {
    it("should return true for supported actions", () => {
      expect(isSupportedDelayedAction(ActionType.ARCHIVE)).toBe(true);
      expect(isSupportedDelayedAction(ActionType.LABEL)).toBe(true);
      expect(isSupportedDelayedAction(ActionType.MARK_READ)).toBe(true);
      expect(isSupportedDelayedAction(ActionType.MARK_SPAM)).toBe(true);
    });

    it("should return false for unsupported actions", () => {
      expect(isSupportedDelayedAction(ActionType.REPLY)).toBe(false);
      expect(isSupportedDelayedAction(ActionType.SEND_EMAIL)).toBe(false);
      expect(isSupportedDelayedAction(ActionType.FORWARD)).toBe(false);
      expect(isSupportedDelayedAction(ActionType.DRAFT_EMAIL)).toBe(false);
    });
  });

  describe("cancelScheduledActions", () => {
    it("should cancel scheduled actions for a message", async () => {
      prisma.scheduledAction.updateMany.mockResolvedValue({ count: 2 });

      const result = await cancelScheduledActions({
        messageId: "msg-123",
        emailAccountId: "account-123",
      });

      expect(prisma.scheduledAction.updateMany).toHaveBeenCalledWith({
        where: {
          emailAccountId: "account-123",
          messageId: "msg-123",
          status: ScheduledActionStatus.PENDING,
        },
        data: {
          status: ScheduledActionStatus.CANCELLED,
          errorMessage: "Superseded by new rule",
        },
      });

      expect(result).toBe(2);
    });

    it("should return zero when no actions to cancel", async () => {
      prisma.scheduledAction.updateMany.mockResolvedValue({ count: 0 });

      const result = await cancelScheduledActions({
        messageId: "msg-456",
        emailAccountId: "account-123",
      });

      expect(result).toBe(0);
    });

    it("should include threadId when provided", async () => {
      prisma.scheduledAction.updateMany.mockResolvedValue({ count: 1 });

      await cancelScheduledActions({
        messageId: "msg-123",
        emailAccountId: "account-123",
        threadId: "thread-123",
        reason: "Custom reason",
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
          errorMessage: "Custom reason",
        },
      });
    });
  });
});
