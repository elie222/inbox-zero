import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { MessagingProvider } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import {
  FOLLOW_UP_MARK_DONE_ACTION_ID,
  handleFollowUpReminderAction,
} from "./follow-up-actions";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

const logger = createScopedLogger("follow-up-actions-test");

function makeEvent(
  overrides: Partial<{
    actionId: string;
    value: string | undefined;
    teamId: string | null;
    userId: string;
  }> = {},
) {
  const postEphemeral = vi.fn().mockResolvedValue(undefined);
  const post = vi.fn().mockResolvedValue(undefined);
  const value = "value" in overrides ? overrides.value : "tracker-1";
  const event = {
    actionId: overrides.actionId ?? FOLLOW_UP_MARK_DONE_ACTION_ID,
    value,
    user: { userId: overrides.userId ?? "U_USER" },
    raw:
      overrides.teamId === null
        ? {}
        : { team: { id: overrides.teamId ?? "T_TEAM" } },
    threadId: "ts-1",
    messageId: "ts-1",
    adapter: { name: "slack" } as any,
    thread: { postEphemeral, post } as any,
    triggerId: undefined,
    openModal: vi.fn(),
  };
  return { event: event as any, postEphemeral, post };
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
      data: { resolved: true },
    });
    expect(postEphemeral).toHaveBeenCalled();
    const text = postEphemeral.mock.calls[0]?.[1];
    expect(typeof text).toBe("string");
    expect(text).toMatch(/done/i);
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

  it("no-ops when the tracker is already resolved", async () => {
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

    expect(prisma.threadTracker.update).not.toHaveBeenCalled();
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
