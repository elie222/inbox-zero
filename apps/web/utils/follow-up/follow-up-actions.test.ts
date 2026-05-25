import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { MessagingProvider } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { createTestLogger } from "@/__tests__/helpers";
import {
  FOLLOW_UP_MARK_DONE_ACTION_ID,
  handleFollowUpReminderAction,
} from "./follow-up-actions";

const { slackChatUpdate } = vi.hoisted(() => ({
  slackChatUpdate: vi
    .fn()
    .mockResolvedValue({ ok: true, ts: "1700000000.000100" }),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/messaging/providers/slack/client", () => ({
  createSlackClient: vi.fn(() => ({
    chat: { update: slackChatUpdate },
  })),
}));

const logger = createTestLogger();

function makeEvent(
  overrides: Partial<{
    actionId: string;
    adapterName: string;
    raw: unknown;
    threadId: string;
    value: string | undefined;
    teamId: string | null;
    userId: string;
  }> = {},
) {
  const postEphemeral = vi.fn().mockResolvedValue(undefined);
  const post = vi.fn().mockResolvedValue(undefined);
  const editMessage = vi.fn().mockResolvedValue(undefined);
  const value = "value" in overrides ? overrides.value : "tracker-1";
  const raw = buildRaw(overrides);
  const event = {
    actionId: overrides.actionId ?? FOLLOW_UP_MARK_DONE_ACTION_ID,
    value,
    user: { userId: overrides.userId ?? "U_USER" },
    raw,
    threadId: overrides.threadId ?? "slack:C_CHANNEL:1700000000.000100",
    messageId: "1700000000.000100",
    adapter: { name: overrides.adapterName ?? "slack", editMessage } as any,
    thread: { postEphemeral, post } as any,
    triggerId: undefined,
    openModal: vi.fn(),
  };
  return { event: event as any, postEphemeral, post, editMessage };
}

function buildRaw(
  overrides: Partial<{ raw: unknown; teamId: string | null }>,
): unknown {
  if ("raw" in overrides) return overrides.raw;
  if (overrides.teamId === null) return {};
  return { team: { id: overrides.teamId ?? "T_TEAM" } };
}

describe("handleFollowUpReminderAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the tracker as resolved when team and user match", async () => {
    prisma.threadTracker.findUnique.mockResolvedValue({
      id: "tracker-1",
      resolved: false,
      emailAccountId: "account-1",
    } as any);
    prisma.messagingChannel.findFirst.mockResolvedValue({
      id: "channel-1",
    } as any);
    prisma.threadTracker.update.mockResolvedValue({} as any);

    const { event, postEphemeral } = makeEvent();
    await handleFollowUpReminderAction({ event, logger });

    expect(prisma.threadTracker.update).toHaveBeenCalledWith({
      where: { id: "tracker-1" },
      data: {
        resolved: true,
        followUpNotifications: Prisma.JsonNull,
      },
    });
    expect(postEphemeral).toHaveBeenCalled();
    const text = postEphemeral.mock.calls[0]?.[1];
    expect(typeof text).toBe("string");
    expect(text).toMatch(/done/i);
  });

  it("replaces the original Slack message so the nudge reflects the resolved state", async () => {
    prisma.threadTracker.findUnique.mockResolvedValue({
      id: "tracker-1",
      resolved: false,
      emailAccountId: "account-1",
    } as any);
    prisma.messagingChannel.findFirst.mockResolvedValue({
      id: "channel-1",
    } as any);
    prisma.threadTracker.update.mockResolvedValue({} as any);

    const { event, editMessage } = makeEvent();
    await handleFollowUpReminderAction({ event, logger });

    expect(editMessage).toHaveBeenCalledTimes(1);
    const [threadId, messageId, card] = editMessage.mock.calls[0] ?? [];
    expect(threadId).toBe("slack:C_CHANNEL:1700000000.000100");
    expect(messageId).toBe("1700000000.000100");
    expect(JSON.stringify(card)).toMatch(/done/i);
  });

  it("replaces the stored Slack notification before clearing its reference", async () => {
    const notification = {
      messagingChannelId: "channel-1",
      provider: MessagingProvider.SLACK,
      providerThreadId: "C_CHANNEL",
      providerMessageId: "1700000000.000100",
    };

    prisma.threadTracker.findUnique.mockResolvedValue({
      id: "tracker-1",
      resolved: false,
      emailAccountId: "account-1",
      followUpNotifications: [notification],
    } as any);
    prisma.messagingChannel.findFirst.mockResolvedValue({
      id: "channel-1",
    } as any);
    prisma.messagingChannel.findMany.mockResolvedValue([
      {
        id: "channel-1",
        provider: MessagingProvider.SLACK,
        accessToken: "xoxb-token",
      },
    ] as any);
    prisma.threadTracker.update.mockResolvedValue({} as any);

    const { event, editMessage } = makeEvent();
    await handleFollowUpReminderAction({ event, logger });

    expect(prisma.threadTracker.update).toHaveBeenNthCalledWith(1, {
      where: { id: "tracker-1" },
      data: { resolved: true },
    });
    expect(slackChatUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C_CHANNEL",
        ts: "1700000000.000100",
        text: expect.stringMatching(/done/i),
        blocks: expect.any(Array),
        unfurl_links: false,
        unfurl_media: false,
      }),
    );
    expect(editMessage).not.toHaveBeenCalled();
    expect(prisma.threadTracker.update).toHaveBeenNthCalledWith(2, {
      where: { id: "tracker-1" },
      data: { followUpNotifications: Prisma.JsonNull },
    });
  });

  it("scopes the channel auth lookup to the tracker's email account, slack, the slack team and the clicker", async () => {
    prisma.threadTracker.findUnique.mockResolvedValue({
      id: "tracker-1",
      resolved: false,
      emailAccountId: "account-1",
    } as any);
    prisma.messagingChannel.findFirst.mockResolvedValue({
      id: "channel-1",
    } as any);
    prisma.threadTracker.update.mockResolvedValue({} as any);

    const { event } = makeEvent({ teamId: "T_REAL", userId: "U_REAL" });
    await handleFollowUpReminderAction({ event, logger });

    const call = prisma.messagingChannel.findFirst.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({
      emailAccountId: "account-1",
      provider: MessagingProvider.SLACK,
      teamId: "T_REAL",
      providerUserId: "U_REAL",
      isConnected: true,
    });
  });

  it("authorizes Telegram Mark done clicks by linked chat and clicker", async () => {
    prisma.threadTracker.findUnique.mockResolvedValue({
      id: "tracker-1",
      resolved: false,
      emailAccountId: "account-1",
    } as any);
    prisma.messagingChannel.findFirst.mockResolvedValue({
      id: "channel-1",
    } as any);
    prisma.threadTracker.update.mockResolvedValue({} as any);

    const { event, post } = makeEvent({
      adapterName: "telegram",
      raw: { message: { chat: { id: "telegram-chat-1" } } },
      threadId: "telegram:telegram-chat-1",
      userId: "telegram-user-1",
    });
    await handleFollowUpReminderAction({ event, logger });

    const call = prisma.messagingChannel.findFirst.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({
      emailAccountId: "account-1",
      provider: MessagingProvider.TELEGRAM,
      teamId: "telegram-chat-1",
      providerUserId: "telegram-user-1",
      isConnected: true,
    });
    expect(prisma.threadTracker.update).toHaveBeenCalledWith({
      where: { id: "tracker-1" },
      data: {
        resolved: true,
        followUpNotifications: Prisma.JsonNull,
      },
    });
    expect(post).toHaveBeenCalled();
  });

  it("rejects when no matching Slack channel is found (different team or user)", async () => {
    prisma.threadTracker.findUnique.mockResolvedValue({
      id: "tracker-1",
      resolved: false,
      emailAccountId: "account-1",
    } as any);
    prisma.messagingChannel.findFirst.mockResolvedValue(null);

    const { event, postEphemeral } = makeEvent();
    await handleFollowUpReminderAction({ event, logger });

    expect(prisma.threadTracker.update).not.toHaveBeenCalled();
    expect(postEphemeral).toHaveBeenCalled();
  });

  it("no-ops when the tracker no longer exists", async () => {
    prisma.threadTracker.findUnique.mockResolvedValue(null);

    const { event, postEphemeral } = makeEvent();
    await handleFollowUpReminderAction({ event, logger });

    expect(prisma.messagingChannel.findFirst).not.toHaveBeenCalled();
    expect(prisma.threadTracker.update).not.toHaveBeenCalled();
    expect(postEphemeral).toHaveBeenCalled();
  });

  it("clears stored notification references when the tracker is already resolved", async () => {
    prisma.threadTracker.findUnique.mockResolvedValue({
      id: "tracker-1",
      resolved: true,
      emailAccountId: "account-1",
    } as any);
    prisma.messagingChannel.findFirst.mockResolvedValue({
      id: "channel-1",
    } as any);

    const { event, postEphemeral } = makeEvent();
    await handleFollowUpReminderAction({ event, logger });

    expect(prisma.threadTracker.update).toHaveBeenCalledWith({
      where: { id: "tracker-1" },
      data: {
        resolved: true,
        followUpNotifications: Prisma.JsonNull,
      },
    });
    expect(postEphemeral).toHaveBeenCalled();
  });

  it("ignores actions with the wrong action ID", async () => {
    const { event } = makeEvent({ actionId: "rule_draft_send" });
    await handleFollowUpReminderAction({ event, logger });

    expect(prisma.threadTracker.findUnique).not.toHaveBeenCalled();
  });

  it("ignores events with no tracker id", async () => {
    const { event, postEphemeral } = makeEvent({ value: undefined });
    await handleFollowUpReminderAction({ event, logger });

    expect(prisma.threadTracker.findUnique).not.toHaveBeenCalled();
    expect(postEphemeral).not.toHaveBeenCalled();
  });
});
