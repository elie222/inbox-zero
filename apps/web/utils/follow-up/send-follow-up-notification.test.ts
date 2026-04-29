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

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma", () => ({ default: {} }));
vi.mock("@/utils/messaging/providers/slack/send", () => ({
  resolveSlackRouteDestination: vi.fn(),
  sendFollowUpReminderToSlack: vi.fn(),
}));
vi.mock("@/utils/automation-jobs/messaging", () => ({
  sendAutomationMessage: vi.fn(),
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

describe("sendFollowUpNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (resolveSlackRouteDestination as any).mockResolvedValue("C1");
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

  it("delivers to Teams/Telegram via automation adapter", async () => {
    await sendFollowUpNotification({ channels: [teamsChannel], ...baseArgs });
    expect(sendAutomationMessage).toHaveBeenCalledTimes(1);
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
