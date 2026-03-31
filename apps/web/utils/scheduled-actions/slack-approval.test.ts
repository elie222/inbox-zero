import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionType, ScheduledActionStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import {
  approveScheduledActionFromSlack,
  rejectScheduledActionFromSlack,
  requestSlackApprovalForScheduledAction,
} from "./slack-approval";

vi.mock("@/utils/prisma");
vi.mock("@/utils/messaging/providers/slack/client", () => ({
  createSlackClient: vi.fn(() => ({ id: "slack-client" })),
}));
vi.mock("@/utils/messaging/providers/slack/send", () => ({
  postMessageWithJoin: vi.fn().mockResolvedValue(undefined),
  resolveSlackDestination: vi.fn().mockResolvedValue("C123"),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn().mockResolvedValue({ id: "provider" }),
}));
vi.mock("./scheduler", () => ({
  markScheduledActionAwaitingConfirmation: vi.fn().mockResolvedValue(true),
  revertScheduledActionAwaitingConfirmation: vi.fn().mockResolvedValue(true),
  markAwaitingConfirmationActionAsExecuting: vi.fn().mockResolvedValue(true),
  cancelAwaitingConfirmationScheduledAction: vi.fn().mockResolvedValue(true),
}));
vi.mock("./executor", () => ({
  executeScheduledAction: vi.fn().mockResolvedValue({
    success: true,
    executedActionId: "executed-action-1",
  }),
  finalizeExecutedRuleIfNoPendingActions: vi.fn().mockResolvedValue(undefined),
}));

const logger = createScopedLogger("test");

describe("slack approval for scheduled actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts a Slack approval request for supported delayed email actions", async () => {
    prisma.messagingChannel.findFirst.mockResolvedValue({
      accessToken: "xoxb-test",
      channelId: "C123",
      providerUserId: "U123",
    } as any);

    const { postMessageWithJoin } = await import(
      "@/utils/messaging/providers/slack/send"
    );

    const result = await requestSlackApprovalForScheduledAction({
      scheduledAction: {
        id: "scheduled-action-1",
        actionType: ActionType.SEND_EMAIL,
        content: "Thanks for the intro.\n\nHappy to help.",
        subject: "Quick follow-up",
        to: "recipient@example.com",
        scheduledFor: new Date("2026-03-23T12:00:00.000Z"),
        emailAccountId: "account-1",
      },
      logger,
    });

    expect(result).toEqual({ status: "requested" });
    expect(postMessageWithJoin).toHaveBeenCalledWith(
      expect.any(Object),
      "C123",
      expect.objectContaining({
        text: 'Approve the scheduled email to recipient@example.com about "Quick follow-up".',
      }),
    );
  });

  it("reverts awaiting-confirmation status if the Slack post fails", async () => {
    prisma.messagingChannel.findFirst.mockResolvedValue({
      accessToken: "xoxb-test",
      channelId: "C123",
      providerUserId: "U123",
    } as any);

    const { postMessageWithJoin } = await import(
      "@/utils/messaging/providers/slack/send"
    );
    const { revertScheduledActionAwaitingConfirmation } = await import(
      "./scheduler"
    );

    vi.mocked(postMessageWithJoin).mockRejectedValueOnce(
      new Error("slack failed"),
    );

    const result = await requestSlackApprovalForScheduledAction({
      scheduledAction: {
        id: "scheduled-action-1",
        actionType: ActionType.REPLY,
        content: "Thanks, I'll take care of it.",
        subject: "Original subject",
        to: null,
        scheduledFor: new Date("2026-03-23T12:00:00.000Z"),
        emailAccountId: "account-1",
      },
      logger,
    });

    expect(result).toEqual({ status: "skipped", reason: "post_failed" });
    expect(revertScheduledActionAwaitingConfirmation).toHaveBeenCalledWith(
      "scheduled-action-1",
    );
  });

  it("approves an awaiting-confirmation action for the authorized Slack user", async () => {
    prisma.scheduledAction.findUnique.mockResolvedValue({
      id: "scheduled-action-1",
      emailAccountId: "account-1",
      executedRuleId: "rule-1",
      status: ScheduledActionStatus.AWAITING_CONFIRMATION,
      actionType: ActionType.REPLY,
      messageId: "msg-1",
      threadId: "thread-1",
      scheduledFor: new Date("2026-03-23T12:00:00.000Z"),
      createdAt: new Date(),
      updatedAt: new Date(),
      label: null,
      labelId: null,
      subject: null,
      content: "Thanks!",
      to: null,
      cc: null,
      bcc: null,
      url: null,
      folderName: null,
      folderId: null,
      scheduledId: null,
      staticAttachments: null,
      executedAt: null,
      executedActionId: null,
      emailAccount: {
        account: {
          provider: "google",
        },
      },
      executedRule: {},
    } as any);
    prisma.messagingChannel.findFirst.mockResolvedValue({ id: "mc-1" } as any);

    const { createEmailProvider } = await import("@/utils/email/provider");
    const { executeScheduledAction } = await import("./executor");

    const result = await approveScheduledActionFromSlack({
      scheduledActionId: "scheduled-action-1",
      providerUserId: "U123",
      teamId: "T123",
      logger,
    });

    expect(result).toEqual({ feedback: "Approved and sent." });
    expect(createEmailProvider).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      provider: "google",
      logger,
    });
    expect(executeScheduledAction).toHaveBeenCalled();
  });

  it("marks the action as failed when approval setup throws after claiming it", async () => {
    prisma.scheduledAction.findUnique.mockResolvedValue({
      id: "scheduled-action-1",
      emailAccountId: "account-1",
      executedRuleId: "rule-1",
      status: ScheduledActionStatus.AWAITING_CONFIRMATION,
      actionType: ActionType.REPLY,
      messageId: "msg-1",
      threadId: "thread-1",
      scheduledFor: new Date("2026-03-23T12:00:00.000Z"),
      createdAt: new Date(),
      updatedAt: new Date(),
      label: null,
      labelId: null,
      subject: null,
      content: "Thanks!",
      to: null,
      cc: null,
      bcc: null,
      url: null,
      folderName: null,
      folderId: null,
      scheduledId: null,
      staticAttachments: null,
      executedAt: null,
      executedActionId: null,
      emailAccount: {
        account: {
          provider: "google",
        },
      },
      executedRule: {},
    } as any);
    prisma.messagingChannel.findFirst.mockResolvedValue({ id: "mc-1" } as any);
    prisma.scheduledAction.update.mockResolvedValue({
      id: "scheduled-action-1",
    } as any);

    const { createEmailProvider } = await import("@/utils/email/provider");

    vi.mocked(createEmailProvider).mockRejectedValueOnce(
      new Error("provider init failed"),
    );

    const result = await approveScheduledActionFromSlack({
      scheduledActionId: "scheduled-action-1",
      providerUserId: "U123",
      teamId: "T123",
      logger,
    });

    expect(result).toEqual({
      feedback: "I couldn't send that delayed action. Please try again.",
    });
    expect(prisma.scheduledAction.update).toHaveBeenCalledWith({
      where: { id: "scheduled-action-1" },
      data: { status: ScheduledActionStatus.FAILED },
    });
  });

  it("rejects an awaiting-confirmation action for the authorized Slack user", async () => {
    prisma.scheduledAction.findUnique.mockResolvedValue({
      id: "scheduled-action-1",
      emailAccountId: "account-1",
      executedRuleId: "rule-1",
      status: ScheduledActionStatus.AWAITING_CONFIRMATION,
    } as any);
    prisma.messagingChannel.findFirst.mockResolvedValue({ id: "mc-1" } as any);

    const { cancelAwaitingConfirmationScheduledAction } = await import(
      "./scheduler"
    );
    const { finalizeExecutedRuleIfNoPendingActions } = await import(
      "./executor"
    );

    const result = await rejectScheduledActionFromSlack({
      scheduledActionId: "scheduled-action-1",
      providerUserId: "U123",
      teamId: "T123",
      logger,
    });

    expect(result).toEqual({
      feedback: "Rejected. The delayed action will not be sent.",
    });
    expect(cancelAwaitingConfirmationScheduledAction).toHaveBeenCalledWith(
      "scheduled-action-1",
    );
    expect(finalizeExecutedRuleIfNoPendingActions).toHaveBeenCalledWith(
      "rule-1",
      logger,
    );
  });
});
