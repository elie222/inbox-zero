import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { disableUnusedAutoDrafts } from "./disable-unused-auto-drafts";
import prisma from "@/utils/prisma";
import { ActionType, SystemType } from "@prisma/client";
import subDays from "date-fns/subDays";

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findMany: vi.fn(),
    },
    executedAction: {
      findMany: vi.fn(),
    },
    action: {
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/utils/error", () => ({
  captureException: vi.fn(),
}));

describe("disableUnusedAutoDrafts", () => {
  const mockFindManyEmailAccount = prisma.emailAccount.findMany as Mock;
  const mockFindManyExecutedAction = prisma.executedAction.findMany as Mock;
  const mockDeleteManyAction = prisma.action.deleteMany as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should disable auto-draft for users who haven't used any of their last 10 drafts", async () => {
    const twoDaysAgo = subDays(new Date(), 2);

    // Mock user with auto-draft enabled
    mockFindManyEmailAccount.mockResolvedValue([
      {
        id: "account-123",
        rules: [{ id: "rule-123" }],
      },
    ]);

    // Mock 10 unused drafts (all older than 1 day)
    const mockUnusedDrafts = Array.from({ length: 10 }, (_, i) => ({
      id: `action-${i}`,
      wasDraftSent: false,
      draftSendLog: null,
      createdAt: twoDaysAgo,
    }));

    mockFindManyExecutedAction.mockResolvedValue(mockUnusedDrafts);

    const result = await disableUnusedAutoDrafts();

    // Verify auto-draft was disabled
    expect(mockDeleteManyAction).toHaveBeenCalledWith({
      where: {
        rule: {
          emailAccountId: "account-123",
          systemType: SystemType.TO_REPLY,
        },
        type: ActionType.DRAFT_EMAIL,
        content: null,
      },
    });

    expect(result).toEqual({
      usersChecked: 1,
      usersDisabled: 1,
      errors: 0,
    });
  });

  it("should not disable auto-draft if user has sent at least one draft", async () => {
    const twoDaysAgo = subDays(new Date(), 2);

    mockFindManyEmailAccount.mockResolvedValue([
      {
        id: "account-456",
        rules: [{ id: "rule-456" }],
      },
    ]);

    // Mock 10 drafts where one was sent
    const mockDraftsWithOneSent = Array.from({ length: 10 }, (_, i) => ({
      id: `action-${i}`,
      wasDraftSent: i === 5, // One draft was sent
      draftSendLog: null,
      createdAt: twoDaysAgo,
    }));

    mockFindManyExecutedAction.mockResolvedValue(mockDraftsWithOneSent);

    const result = await disableUnusedAutoDrafts();

    // Verify auto-draft was NOT disabled
    expect(mockDeleteManyAction).not.toHaveBeenCalled();

    expect(result).toEqual({
      usersChecked: 1,
      usersDisabled: 0,
      errors: 0,
    });
  });

  it("should not disable auto-draft if user has draft with send log", async () => {
    const twoDaysAgo = subDays(new Date(), 2);

    mockFindManyEmailAccount.mockResolvedValue([
      {
        id: "account-789",
        rules: [{ id: "rule-789" }],
      },
    ]);

    // Mock 10 drafts where one has a send log
    const mockDraftsWithSendLog = Array.from({ length: 10 }, (_, i) => ({
      id: `action-${i}`,
      wasDraftSent: false,
      draftSendLog: i === 3 ? { id: "log-123" } : null, // One has send log
      createdAt: twoDaysAgo,
    }));

    mockFindManyExecutedAction.mockResolvedValue(mockDraftsWithSendLog);

    const result = await disableUnusedAutoDrafts();

    // Verify auto-draft was NOT disabled
    expect(mockDeleteManyAction).not.toHaveBeenCalled();

    expect(result).toEqual({
      usersChecked: 1,
      usersDisabled: 0,
      errors: 0,
    });
  });

  it("should skip users with fewer than 10 drafts", async () => {
    const twoDaysAgo = subDays(new Date(), 2);

    mockFindManyEmailAccount.mockResolvedValue([
      {
        id: "account-999",
        rules: [{ id: "rule-999" }],
      },
    ]);

    // Mock only 5 drafts (less than 10)
    const mockFewDrafts = Array.from({ length: 5 }, (_, i) => ({
      id: `action-${i}`,
      wasDraftSent: false,
      draftSendLog: null,
      createdAt: twoDaysAgo,
    }));

    mockFindManyExecutedAction.mockResolvedValue(mockFewDrafts);

    const result = await disableUnusedAutoDrafts();

    // Verify auto-draft was NOT disabled
    expect(mockDeleteManyAction).not.toHaveBeenCalled();

    expect(result).toEqual({
      usersChecked: 1,
      usersDisabled: 0,
      errors: 0,
    });
  });

  it("should handle multiple users correctly", async () => {
    const twoDaysAgo = subDays(new Date(), 2);

    mockFindManyEmailAccount.mockResolvedValue([
      { id: "account-1", rules: [{ id: "rule-1" }] },
      { id: "account-2", rules: [{ id: "rule-2" }] },
      { id: "account-3", rules: [{ id: "rule-3" }] },
    ]);

    // Mock different scenarios for each user
    mockFindManyExecutedAction
      .mockResolvedValueOnce(
        // User 1: 10 unused drafts - should be disabled
        Array.from({ length: 10 }, (_, i) => ({
          id: `action-1-${i}`,
          wasDraftSent: false,
          draftSendLog: null,
          createdAt: twoDaysAgo,
        })),
      )
      .mockResolvedValueOnce(
        // User 2: 10 drafts with one sent - should NOT be disabled
        Array.from({ length: 10 }, (_, i) => ({
          id: `action-2-${i}`,
          wasDraftSent: i === 0,
          draftSendLog: null,
          createdAt: twoDaysAgo,
        })),
      )
      .mockResolvedValueOnce(
        // User 3: Only 5 drafts - should NOT be disabled
        Array.from({ length: 5 }, (_, i) => ({
          id: `action-3-${i}`,
          wasDraftSent: false,
          draftSendLog: null,
          createdAt: twoDaysAgo,
        })),
      );

    const result = await disableUnusedAutoDrafts();

    // Only user 1 should have auto-draft disabled
    expect(mockDeleteManyAction).toHaveBeenCalledTimes(1);
    expect(mockDeleteManyAction).toHaveBeenCalledWith({
      where: {
        rule: {
          emailAccountId: "account-1",
          systemType: SystemType.TO_REPLY,
        },
        type: ActionType.DRAFT_EMAIL,
        content: null,
      },
    });

    expect(result).toEqual({
      usersChecked: 3,
      usersDisabled: 1,
      errors: 0,
    });
  });

  it("should handle errors gracefully", async () => {
    mockFindManyEmailAccount.mockResolvedValue([
      { id: "account-error", rules: [{ id: "rule-error" }] },
    ]);

    // Mock an error when finding drafts
    mockFindManyExecutedAction.mockRejectedValue(new Error("Database error"));

    const result = await disableUnusedAutoDrafts();

    expect(result).toEqual({
      usersChecked: 1,
      usersDisabled: 0,
      errors: 1,
    });
  });
});
