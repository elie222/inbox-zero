import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
  ThreadTrackerType,
} from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import {
  sendFollowUpNotification,
  type FollowUpNotificationChannel,
} from "./send-follow-up-notification";
import {
  resolveSlackRouteDestination,
  sendFollowUpReminderToSlack,
} from "@/utils/messaging/providers/slack/send";
import { sendAutomationMessage } from "@/utils/automation-jobs/messaging";

const mockTelegramOpenDm = vi.fn();
const mockTelegramPostMessage = vi.fn();

vi.mock("@/utils/prisma", () => ({ default: {} }));
vi.mock("@/utils/messaging/providers/slack/send", () => ({
  resolveSlackRouteDestination: vi.fn(),
  sendFollowUpReminderToSlack: vi.fn(),
}));
vi.mock("@/utils/automation-jobs/messaging", () => ({
  sendAutomationMessage: vi.fn(),
}));
vi.mock("@/utils/messaging/chat-sdk/adapters", () => ({
  getMessagingAdapterRegistry: () => ({
    typedAdapters: {
      telegram: {
        openDM: (...args: unknown[]) => mockTelegramOpenDm(...args),
        postMessage: (...args: unknown[]) => mockTelegramPostMessage(...args),
      },
    },
  }),
}));

const logger = createScopedLogger("send-follow-up-test");

const baseArgs = {
  subject: "Project update",
  counterpartyName: "Alex Tester",
  counterpartyEmail: "alex@example.com",
  trackerType: ThreadTrackerType.AWAITING,
  daysSinceSent: 3,
  snippet: "Following up on the items we discussed.",
  threadLink: "https://mail.example/thread",
  trackerId: "tracker-1",
  logger,
};

const slackChannel: FollowUpNotificationChannel = {
  id: "channel-1",
  provider: MessagingProvider.SLACK,
  isConnected: true,
  accessToken: "xoxb-token",
  teamId: "team-1",
  providerUserId: "U1",
  routes: [
    {
      purpose: MessagingRoutePurpose.FOLLOW_UPS,
      targetType: MessagingRouteTargetType.CHANNEL,
      targetId: "C1",
    },
  ],
};

const teamsChannel: FollowUpNotificationChannel = {
  id: "channel-2",
  provider: MessagingProvider.TEAMS,
  isConnected: true,
  accessToken: "teams-token",
  teamId: null,
  providerUserId: "teams-user-id",
  routes: [
    {
      purpose: MessagingRoutePurpose.FOLLOW_UPS,
      targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
      targetId: "teams-user-id",
    },
  ],
};

const telegramChannel: FollowUpNotificationChannel = {
  id: "channel-3",
  provider: MessagingProvider.TELEGRAM,
  isConnected: true,
  accessToken: null,
  teamId: "telegram-chat-1",
  providerUserId: "telegram-user-id",
  routes: [
    {
      purpose: MessagingRoutePurpose.FOLLOW_UPS,
      targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
      targetId: "telegram-chat-1",
    },
  ],
};

describe("sendFollowUpNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (resolveSlackRouteDestination as any).mockResolvedValue("C1");
    mockTelegramOpenDm.mockResolvedValue("telegram-thread-1");
    mockTelegramPostMessage.mockResolvedValue({ id: "telegram-message-1" });
  });

  it("no-ops when no channels are provided", async () => {
    await sendFollowUpNotification({ channels: [], ...baseArgs });
    expect(sendFollowUpReminderToSlack).not.toHaveBeenCalled();
    expect(sendAutomationMessage).not.toHaveBeenCalled();
  });

  it("delivers to Slack channels", async () => {
    await sendFollowUpNotification({ channels: [slackChannel], ...baseArgs });
    expect(sendFollowUpReminderToSlack).toHaveBeenCalledTimes(1);
  });

  it("delivers to Teams via automation adapter", async () => {
    await sendFollowUpNotification({ channels: [teamsChannel], ...baseArgs });
    expect(sendAutomationMessage).toHaveBeenCalledTimes(1);
  });

  it("delivers Telegram follow-ups with a thread link button instead of raw URL text", async () => {
    const threadLink = "https://outlook.live.com/mail/0/inbox/id/thread-1";

    await sendFollowUpNotification({
      channels: [telegramChannel],
      ...baseArgs,
      threadLink,
      threadLinkLabel: "Open in Outlook",
    });

    expect(sendAutomationMessage).not.toHaveBeenCalled();
    expect(mockTelegramOpenDm).toHaveBeenCalledWith("telegram-chat-1");
    expect(mockTelegramPostMessage).toHaveBeenCalledTimes(1);

    const [, card] = mockTelegramPostMessage.mock.calls[0];
    const serializedCard = JSON.stringify(card);
    expect(serializedCard).toContain("Follow-up nudge");
    expect(serializedCard).toContain("Open in Outlook");
    expect(serializedCard).toContain(threadLink);
    expect(serializedCard).not.toContain(`Open: ${threadLink}`);
  });

  it("preserves multi-line Telegram snippets past the old short preview cap", async () => {
    const body =
      "I hope you're doing well. I'm reaching out because I'd like to find some time for us to reunite and discuss the new ebook. ";
    const snippet = [
      "Hi Barbara,",
      "",
      body.repeat(3).trim(),
      "Please let me know when you might be available to chat.",
      "",
      "Best regards,",
    ].join("\n");

    expect(snippet.length).toBeGreaterThan(280);

    await sendFollowUpNotification({
      channels: [telegramChannel],
      ...baseArgs,
      snippet,
    });

    const [, card] = mockTelegramPostMessage.mock.calls[0];
    const snippetChild = (card as any).children.find(
      (child: any) =>
        child.type === "text" && child.content.includes("Your sent email:"),
    );

    expect(snippetChild.content).toContain("> Hi Barbara,\n>\n> I hope");
    expect(snippetChild.content).toContain("Best regards,");
  });

  it("fans out across multiple channels in parallel", async () => {
    await sendFollowUpNotification({
      channels: [slackChannel, teamsChannel],
      ...baseArgs,
    });
    expect(sendFollowUpReminderToSlack).toHaveBeenCalledTimes(1);
    expect(sendAutomationMessage).toHaveBeenCalledTimes(1);
  });

  it("swallows per-channel failures so the caller continues", async () => {
    (sendFollowUpReminderToSlack as any).mockRejectedValue(new Error("boom"));
    (sendAutomationMessage as any).mockRejectedValue(new Error("boom"));
    await expect(
      sendFollowUpNotification({
        channels: [slackChannel, teamsChannel],
        ...baseArgs,
      }),
    ).resolves.toBeUndefined();
  });

  it("skips Slack channel when access token is missing", async () => {
    await sendFollowUpNotification({
      channels: [{ ...slackChannel, accessToken: null }],
      ...baseArgs,
    });
    expect(sendFollowUpReminderToSlack).not.toHaveBeenCalled();
  });
});
