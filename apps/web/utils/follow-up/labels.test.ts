import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getOrCreateFollowUpLabel,
  applyFollowUpLabel,
  removeFollowUpLabel,
  hasFollowUpLabel,
  clearFollowUpLabel,
} from "./labels";
import { getMockMessage, createTestLogger } from "@/__tests__/helpers";
import { createMockEmailProvider } from "@/__tests__/mocks/email-provider.mock";
import prisma from "@/utils/__mocks__/prisma";
import { Prisma } from "@/generated/prisma/client";
import { MessagingProvider } from "@/generated/prisma/enums";

const messagingMocks = vi.hoisted(() => ({
  slackChatUpdate: vi.fn(),
  teamsEditMessage: vi.fn(),
  telegramEditMessage: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/messaging/providers/slack/client", () => ({
  createSlackClient: () => ({
    chat: {
      update: messagingMocks.slackChatUpdate,
    },
  }),
}));
vi.mock("@/utils/messaging/chat-sdk/adapters", () => ({
  getMessagingAdapterRegistry: () => ({
    typedAdapters: {
      teams: {
        editMessage: messagingMocks.teamsEditMessage,
      },
      telegram: {
        editMessage: messagingMocks.telegramEditMessage,
      },
    },
  }),
}));

const logger = createTestLogger();

describe("getOrCreateFollowUpLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing label if found", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
    });

    const result = await getOrCreateFollowUpLabel(mockProvider);

    expect(result).toEqual({ id: "label-123", name: "Follow-up" });
    expect(mockProvider.getLabelByName).toHaveBeenCalledWith("Follow-up");
    expect(mockProvider.createLabel).not.toHaveBeenCalled();
  });

  it("creates new label if not found", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi.fn().mockResolvedValue(null),
      createLabel: vi
        .fn()
        .mockResolvedValue({ id: "new-label-456", name: "Follow-up" }),
    });

    const result = await getOrCreateFollowUpLabel(mockProvider);

    expect(result).toEqual({ id: "new-label-456", name: "Follow-up" });
    expect(mockProvider.getLabelByName).toHaveBeenCalledWith("Follow-up");
    expect(mockProvider.createLabel).toHaveBeenCalledWith("Follow-up");
  });
});

describe("applyFollowUpLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies label to message", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
      labelMessage: vi.fn().mockResolvedValue(undefined),
    });

    await applyFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      messageId: "msg-1",
      logger,
    });

    expect(mockProvider.labelMessage).toHaveBeenCalledWith({
      messageId: "msg-1",
      labelId: "label-123",
      labelName: "Follow-up",
    });
  });

  it("creates label if not exists before applying", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi.fn().mockResolvedValue(null),
      createLabel: vi
        .fn()
        .mockResolvedValue({ id: "new-label", name: "Follow-up" }),
      labelMessage: vi.fn().mockResolvedValue(undefined),
    });

    await applyFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      messageId: "msg-1",
      logger,
    });

    expect(mockProvider.createLabel).toHaveBeenCalledWith("Follow-up");
    expect(mockProvider.labelMessage).toHaveBeenCalledWith({
      messageId: "msg-1",
      labelId: "new-label",
      labelName: "Follow-up",
    });
  });
});

describe("removeFollowUpLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes label from thread if exists", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
      removeThreadLabel: vi.fn().mockResolvedValue(undefined),
    });

    await removeFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      logger,
    });

    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      "thread-1",
      "label-123",
    );
  });

  it("does nothing if label does not exist", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi.fn().mockResolvedValue(null),
    });

    await removeFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      logger,
    });

    expect(mockProvider.removeThreadLabel).not.toHaveBeenCalled();
  });

  it("handles error when removing label (label not on thread)", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
      removeThreadLabel: vi
        .fn()
        .mockRejectedValue(new Error("Label not on thread")),
    });

    await expect(
      removeFollowUpLabel({
        provider: mockProvider,
        threadId: "thread-1",
        logger,
      }),
    ).resolves.not.toThrow();
  });
});

describe("hasFollowUpLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true if any message has the label", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
      getThread: vi.fn().mockResolvedValue({
        id: "thread-1",
        messages: [
          getMockMessage({ id: "msg-1", labelIds: ["other-label"] }),
          getMockMessage({ id: "msg-2", labelIds: ["label-123", "another"] }),
        ],
      }),
    });

    const result = await hasFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      logger,
    });

    expect(result).toBe(true);
  });

  it("returns false if no message has the label", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
      getThread: vi.fn().mockResolvedValue({
        id: "thread-1",
        messages: [
          getMockMessage({ id: "msg-1", labelIds: ["other-label"] }),
          getMockMessage({ id: "msg-2", labelIds: ["another"] }),
        ],
      }),
    });

    const result = await hasFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      logger,
    });

    expect(result).toBe(false);
  });

  it("returns false if label does not exist", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi.fn().mockResolvedValue(null),
    });

    const result = await hasFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      logger,
    });

    expect(result).toBe(false);
    expect(mockProvider.getThread).not.toHaveBeenCalled();
  });

  it("returns false if thread has no messages", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
      getThread: vi.fn().mockResolvedValue({
        id: "thread-1",
        messages: [],
      }),
    });

    const result = await hasFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      logger,
    });

    expect(result).toBe(false);
  });

  it("returns false on error", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
      getThread: vi.fn().mockRejectedValue(new Error("Thread not found")),
    });

    const result = await hasFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      logger,
    });

    expect(result).toBe(false);
  });
});

describe("clearFollowUpLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.messagingChannel.findMany.mockResolvedValue([]);
  });

  it("does not touch provider labels or notifications without active follow-up state", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
    });

    prisma.threadTracker.findMany.mockResolvedValue([]);

    await clearFollowUpLabel({
      emailAccountId: "account-1",
      threadId: "thread-1",
      provider: mockProvider,
      logger,
    });

    expect(prisma.threadTracker.findMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account-1",
        threadId: "thread-1",
        OR: [
          { followUpAppliedAt: { not: null } },
          { followUpDraftId: { not: null } },
          { followUpNotifications: { not: Prisma.AnyNull } },
        ],
      },
      select: {
        id: true,
        messageId: true,
        followUpAppliedAt: true,
        followUpDraftId: true,
        followUpNotifications: true,
        resolved: true,
      },
    });
    expect(prisma.threadTracker.updateMany).not.toHaveBeenCalled();
    expect(prisma.messagingChannel.findMany).not.toHaveBeenCalled();
    expect(mockProvider.getLabelByName).not.toHaveBeenCalled();
    expect(mockProvider.removeThreadLabel).not.toHaveBeenCalled();
    expect(messagingMocks.slackChatUpdate).not.toHaveBeenCalled();
    expect(messagingMocks.teamsEditMessage).not.toHaveBeenCalled();
    expect(messagingMocks.telegramEditMessage).not.toHaveBeenCalled();
  });

  it("removes label and resolves active follow-up without clearing followUpAppliedAt", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
    });

    prisma.threadTracker.findMany.mockResolvedValue([
      {
        id: "tracker-1",
        messageId: "message-1",
        followUpAppliedAt: new Date("2026-05-20T10:00:00.000Z"),
        followUpDraftId: null,
        resolved: false,
      },
    ]);
    prisma.threadTracker.updateMany.mockResolvedValue({ count: 1 });

    await clearFollowUpLabel({
      emailAccountId: "account-1",
      threadId: "thread-1",
      provider: mockProvider,
      logger,
    });

    expect(prisma.threadTracker.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["tracker-1"] },
      },
      data: {
        resolved: true,
      },
    });
    expect(prisma.threadTracker.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ followUpAppliedAt: null }),
      }),
    );
    expect(mockProvider.deleteDraft).not.toHaveBeenCalled();
    // Always removes label
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      "thread-1",
      "label-123",
    );
  });

  it("deletes follow-up draft and clears followUpDraftId on success", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
      deleteDraft: vi.fn().mockResolvedValue(undefined),
    });

    prisma.threadTracker.findMany.mockResolvedValue([
      {
        id: "tracker-1",
        messageId: "message-1",
        followUpAppliedAt: new Date("2026-05-20T10:00:00.000Z"),
        followUpDraftId: "draft-abc",
        resolved: false,
      },
    ]);
    prisma.threadTracker.updateMany.mockResolvedValue({ count: 1 });

    await clearFollowUpLabel({
      emailAccountId: "account-1",
      threadId: "thread-1",
      provider: mockProvider,
      logger,
    });

    expect(mockProvider.deleteDraft).toHaveBeenCalledWith("draft-abc");
    // Clears followUpDraftId for successfully deleted drafts
    expect(prisma.threadTracker.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["tracker-1"] },
      },
      data: {
        followUpDraftId: null,
      },
    });
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      "thread-1",
      "label-123",
    );
  });

  it("preserves followUpDraftId when draft deletion fails so fallback can retry", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
      deleteDraft: vi.fn().mockRejectedValue(new Error("Draft not found")),
    });

    prisma.threadTracker.findMany.mockResolvedValue([
      {
        id: "tracker-1",
        messageId: "message-1",
        followUpAppliedAt: new Date("2026-05-20T10:00:00.000Z"),
        followUpDraftId: "draft-abc",
        resolved: false,
      },
    ]);
    prisma.threadTracker.updateMany.mockResolvedValue({ count: 1 });

    await clearFollowUpLabel({
      emailAccountId: "account-1",
      threadId: "thread-1",
      provider: mockProvider,
      logger,
    });

    expect(mockProvider.deleteDraft).toHaveBeenCalledWith("draft-abc");
    // Should NOT clear followUpDraftId (deletion failed)
    expect(prisma.threadTracker.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["tracker-1"] } },
        data: { followUpDraftId: null },
      }),
    );
    expect(prisma.threadTracker.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["tracker-1"] },
      },
      data: {
        resolved: true,
      },
    });
    expect(prisma.threadTracker.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ followUpAppliedAt: null }),
      }),
    );
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      "thread-1",
      "label-123",
    );
  });

  it("only clears followUpDraftId for trackers whose deletion succeeded", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
      deleteDraft: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Network failure")),
    });

    prisma.threadTracker.findMany.mockResolvedValue([
      { id: "tracker-1", followUpDraftId: "draft-abc" },
      { id: "tracker-2", followUpDraftId: "draft-def" },
    ]);
    prisma.threadTracker.updateMany.mockResolvedValue({ count: 1 });

    await clearFollowUpLabel({
      emailAccountId: "account-1",
      threadId: "thread-1",
      provider: mockProvider,
      logger,
    });

    expect(mockProvider.deleteDraft).toHaveBeenNthCalledWith(1, "draft-abc");
    expect(mockProvider.deleteDraft).toHaveBeenNthCalledWith(2, "draft-def");
    // Only tracker-1 succeeded, so only its draftId is cleared
    expect(prisma.threadTracker.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["tracker-1"] },
      },
      data: {
        followUpDraftId: null,
      },
    });
  });

  it("still removes label when trackers are already resolved", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
    });

    // Active tracker with no draft (e.g. resolved tracker with appliedAt still set)
    prisma.threadTracker.findMany.mockResolvedValue([
      { id: "tracker-1", followUpDraftId: null },
    ]);
    prisma.threadTracker.updateMany.mockResolvedValue({ count: 0 });

    await clearFollowUpLabel({
      emailAccountId: "account-1",
      threadId: "thread-1",
      provider: mockProvider,
      logger,
    });

    // Label is always removed regardless of tracker state
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      "thread-1",
      "label-123",
    );
  });

  it("does not clear follow-up state when the webhook is for the tracked message", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
    });

    prisma.threadTracker.findMany.mockResolvedValue([
      {
        id: "tracker-1",
        messageId: "tracked-message-1",
        followUpAppliedAt: new Date("2026-05-20T10:00:00.000Z"),
        followUpDraftId: null,
        resolved: false,
      },
    ]);

    await clearFollowUpLabel({
      emailAccountId: "account-1",
      threadId: "thread-1",
      triggerMessageId: "tracked-message-1",
      provider: mockProvider,
      logger,
    });

    expect(prisma.threadTracker.updateMany).not.toHaveBeenCalled();
    expect(prisma.messagingChannel.findMany).not.toHaveBeenCalled();
    expect(mockProvider.getLabelByName).not.toHaveBeenCalled();
    expect(mockProvider.removeThreadLabel).not.toHaveBeenCalled();
    expect(messagingMocks.slackChatUpdate).not.toHaveBeenCalled();
    expect(messagingMocks.teamsEditMessage).not.toHaveBeenCalled();
    expect(messagingMocks.telegramEditMessage).not.toHaveBeenCalled();
  });

  it("does not clear follow-up state for a tracked-message webhook when the thread has older trackers", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
    });

    prisma.threadTracker.findMany.mockResolvedValue([
      {
        id: "tracker-1",
        messageId: "tracked-message-1",
        followUpAppliedAt: new Date("2026-05-20T10:00:00.000Z"),
        followUpDraftId: null,
        resolved: false,
      },
      {
        id: "tracker-2",
        messageId: "older-message-1",
        followUpAppliedAt: new Date("2026-05-19T10:00:00.000Z"),
        followUpDraftId: null,
        resolved: true,
      },
    ]);

    await clearFollowUpLabel({
      emailAccountId: "account-1",
      threadId: "thread-1",
      triggerMessageId: "tracked-message-1",
      provider: mockProvider,
      logger,
    });

    expect(prisma.threadTracker.updateMany).not.toHaveBeenCalled();
    expect(prisma.messagingChannel.findMany).not.toHaveBeenCalled();
    expect(mockProvider.getLabelByName).not.toHaveBeenCalled();
    expect(mockProvider.removeThreadLabel).not.toHaveBeenCalled();
  });

  it("updates delivered follow-up notifications when a reply clears the follow-up", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
    });
    const notifications = [
      {
        messagingChannelId: "channel-1",
        provider: MessagingProvider.SLACK,
        providerThreadId: "C123",
        providerMessageId: "1700000000.000100",
      },
      {
        messagingChannelId: "channel-2",
        provider: MessagingProvider.TEAMS,
        providerThreadId: "teams-thread-1",
        providerMessageId: "teams-message-1",
      },
      {
        messagingChannelId: "channel-3",
        provider: MessagingProvider.TELEGRAM,
        providerThreadId: "telegram-thread-1",
        providerMessageId: "telegram-message-1",
      },
    ];

    prisma.threadTracker.findMany
      .mockResolvedValueOnce([{ id: "tracker-1", followUpDraftId: null }])
      .mockResolvedValueOnce([
        {
          id: "tracker-1",
          followUpNotifications: notifications,
        },
      ]);
    prisma.threadTracker.updateMany.mockResolvedValue({ count: 1 });
    prisma.messagingChannel.findMany.mockResolvedValue([
      {
        id: "channel-1",
        provider: MessagingProvider.SLACK,
        isConnected: true,
        accessToken: "xoxb-token",
      },
      {
        id: "channel-2",
        provider: MessagingProvider.TEAMS,
        isConnected: true,
        accessToken: null,
      },
      {
        id: "channel-3",
        provider: MessagingProvider.TELEGRAM,
        isConnected: true,
        accessToken: null,
      },
    ]);

    await clearFollowUpLabel({
      emailAccountId: "account-1",
      threadId: "thread-1",
      provider: mockProvider,
      logger,
    });

    expect(prisma.threadTracker.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        emailAccountId: "account-1",
        threadId: "thread-1",
        followUpNotifications: { not: Prisma.AnyNull },
      },
      select: {
        id: true,
        followUpNotifications: true,
      },
    });
    expect(prisma.messagingChannel.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["channel-1", "channel-2", "channel-3"] },
        isConnected: true,
      },
      select: {
        id: true,
        provider: true,
        isConnected: true,
        accessToken: true,
      },
    });
    expect(prisma.threadTracker.updateMany).toHaveBeenCalledWith({
      where: {
        id: "tracker-1",
        followUpNotifications: { equals: notifications },
      },
      data: {
        followUpNotifications: expect.objectContaining({
          type: "reply-received-cleanup-claim",
          claimId: expect.any(String),
          claimedAt: expect.any(String),
          notifications,
        }),
      },
    });
    expect(prisma.threadTracker.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["tracker-1"] },
        followUpNotifications: {
          path: ["claimId"],
          equals: expect.any(String),
        },
      },
      data: {
        followUpNotifications: Prisma.JsonNull,
      },
    });
    expect(messagingMocks.slackChatUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C123",
        ts: "1700000000.000100",
      }),
    );
    expect(messagingMocks.teamsEditMessage).toHaveBeenCalledWith(
      "teams-thread-1",
      "teams-message-1",
      expect.stringMatching(/follow-up/i),
    );
    expect(messagingMocks.telegramEditMessage).toHaveBeenCalledWith(
      "telegram-thread-1",
      "telegram-message-1",
      expect.stringMatching(/follow-up/i),
    );
  });

  it("does not update follow-up notifications when cleanup was already claimed", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
    });
    const notifications = [
      {
        messagingChannelId: "channel-1",
        provider: MessagingProvider.SLACK,
        providerThreadId: "C123",
        providerMessageId: "1700000000.000100",
      },
    ];

    prisma.threadTracker.findMany
      .mockResolvedValueOnce([{ id: "tracker-1", followUpDraftId: null }])
      .mockResolvedValueOnce([
        {
          id: "tracker-1",
          followUpNotifications: notifications,
        },
      ]);
    prisma.threadTracker.updateMany.mockResolvedValueOnce({ count: 0 });

    await clearFollowUpLabel({
      emailAccountId: "account-1",
      threadId: "thread-1",
      provider: mockProvider,
      logger,
    });

    expect(prisma.threadTracker.updateMany).toHaveBeenCalledWith({
      where: {
        id: "tracker-1",
        followUpNotifications: { equals: notifications },
      },
      data: {
        followUpNotifications: expect.objectContaining({
          type: "reply-received-cleanup-claim",
          notifications,
        }),
      },
    });
    expect(prisma.messagingChannel.findMany).not.toHaveBeenCalled();
    expect(messagingMocks.slackChatUpdate).not.toHaveBeenCalled();
    expect(messagingMocks.teamsEditMessage).not.toHaveBeenCalled();
    expect(messagingMocks.telegramEditMessage).not.toHaveBeenCalled();
  });

  it("reclaims expired follow-up notification cleanup claims", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
    });
    const notifications = [
      {
        messagingChannelId: "channel-1",
        provider: MessagingProvider.SLACK,
        providerThreadId: "C123",
        providerMessageId: "1700000000.000100",
      },
    ];
    const expiredClaim = {
      type: "reply-received-cleanup-claim",
      claimId: "stale-claim",
      claimedAt: "2000-01-01T00:00:00.000Z",
      notifications,
    };

    prisma.threadTracker.findMany
      .mockResolvedValueOnce([{ id: "tracker-1", followUpDraftId: null }])
      .mockResolvedValueOnce([
        {
          id: "tracker-1",
          followUpNotifications: expiredClaim,
        },
      ]);
    prisma.threadTracker.updateMany.mockResolvedValue({ count: 1 });
    prisma.messagingChannel.findMany.mockResolvedValue([
      {
        id: "channel-1",
        provider: MessagingProvider.SLACK,
        isConnected: true,
        accessToken: "xoxb-token",
      },
    ]);

    await clearFollowUpLabel({
      emailAccountId: "account-1",
      threadId: "thread-1",
      provider: mockProvider,
      logger,
    });

    expect(prisma.threadTracker.updateMany).toHaveBeenCalledWith({
      where: {
        id: "tracker-1",
        followUpNotifications: { equals: expiredClaim },
      },
      data: {
        followUpNotifications: expect.objectContaining({
          type: "reply-received-cleanup-claim",
          claimId: expect.any(String),
          notifications,
        }),
      },
    });
    expect(messagingMocks.slackChatUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C123",
        ts: "1700000000.000100",
      }),
    );
    expect(prisma.threadTracker.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["tracker-1"] },
        followUpNotifications: {
          path: ["claimId"],
          equals: expect.any(String),
        },
      },
      data: {
        followUpNotifications: Prisma.JsonNull,
      },
    });
  });

  it("keeps claimed follow-up notifications for retry when a messaging update fails", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
    });
    const notifications = [
      {
        messagingChannelId: "channel-1",
        provider: MessagingProvider.SLACK,
        providerThreadId: "C123",
        providerMessageId: "1700000000.000100",
      },
    ];

    prisma.threadTracker.findMany
      .mockResolvedValueOnce([{ id: "tracker-1", followUpDraftId: null }])
      .mockResolvedValueOnce([
        {
          id: "tracker-1",
          followUpNotifications: notifications,
        },
      ]);
    prisma.threadTracker.updateMany.mockResolvedValue({ count: 1 });
    prisma.messagingChannel.findMany.mockResolvedValue([
      {
        id: "channel-1",
        provider: MessagingProvider.SLACK,
        isConnected: true,
        accessToken: "xoxb-token",
      },
    ]);
    messagingMocks.slackChatUpdate.mockRejectedValueOnce(
      new Error("Slack timeout"),
    );

    await clearFollowUpLabel({
      emailAccountId: "account-1",
      threadId: "thread-1",
      provider: mockProvider,
      logger,
    });

    expect(messagingMocks.slackChatUpdate).toHaveBeenCalledTimes(1);
    expect(prisma.threadTracker.updateMany).not.toHaveBeenCalledWith({
      where: {
        id: { in: ["tracker-1"] },
        followUpNotifications: {
          path: ["claimId"],
          equals: expect.any(String),
        },
      },
      data: {
        followUpNotifications: Prisma.JsonNull,
      },
    });
  });

  it("only updates notifications from trackers this worker claimed", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
    });
    const claimedNotifications = [
      {
        messagingChannelId: "channel-1",
        provider: MessagingProvider.SLACK,
        providerThreadId: "C123",
        providerMessageId: "1700000000.000100",
      },
    ];
    const unclaimedNotifications = [
      {
        messagingChannelId: "channel-2",
        provider: MessagingProvider.SLACK,
        providerThreadId: "C456",
        providerMessageId: "1700000000.000200",
      },
    ];

    prisma.threadTracker.findMany
      .mockResolvedValueOnce([{ id: "tracker-1", followUpDraftId: null }])
      .mockResolvedValueOnce([
        {
          id: "tracker-1",
          followUpNotifications: claimedNotifications,
        },
        {
          id: "tracker-2",
          followUpNotifications: unclaimedNotifications,
        },
      ]);
    prisma.threadTracker.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.messagingChannel.findMany.mockResolvedValue([
      {
        id: "channel-1",
        provider: MessagingProvider.SLACK,
        isConnected: true,
        accessToken: "xoxb-token",
      },
    ]);

    await clearFollowUpLabel({
      emailAccountId: "account-1",
      threadId: "thread-1",
      provider: mockProvider,
      logger,
    });

    expect(prisma.messagingChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["channel-1"] },
        }),
      }),
    );
    expect(messagingMocks.slackChatUpdate).toHaveBeenCalledTimes(1);
    expect(messagingMocks.slackChatUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C123",
        ts: "1700000000.000100",
      }),
    );
  });
});
