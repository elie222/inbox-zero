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
  sender: "Alex",
  trackerType: ThreadTrackerType.AWAITING,
  daysSinceSent: 3,
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

  it("returns anySucceeded=false when no channels are provided", async () => {
    const result = await sendFollowUpNotification({
      channels: [],
      ...baseArgs,
    });
    expect(result.anySucceeded).toBe(false);
    expect(sendFollowUpReminderToSlack).not.toHaveBeenCalled();
    expect(sendAutomationMessage).not.toHaveBeenCalled();
  });

  it("delivers to Slack channels", async () => {
    const result = await sendFollowUpNotification({
      channels: [slackChannel],
      ...baseArgs,
    });
    expect(result.anySucceeded).toBe(true);
    expect(sendFollowUpReminderToSlack).toHaveBeenCalledTimes(1);
  });

  it("delivers to Teams/Telegram via automation adapter", async () => {
    const result = await sendFollowUpNotification({
      channels: [teamsChannel],
      ...baseArgs,
    });
    expect(result.anySucceeded).toBe(true);
    expect(sendAutomationMessage).toHaveBeenCalledTimes(1);
  });

  it("fans out across multiple channels in parallel", async () => {
    const result = await sendFollowUpNotification({
      channels: [slackChannel, teamsChannel],
      ...baseArgs,
    });
    expect(result.anySucceeded).toBe(true);
    expect(sendFollowUpReminderToSlack).toHaveBeenCalledTimes(1);
    expect(sendAutomationMessage).toHaveBeenCalledTimes(1);
  });

  it("returns anySucceeded=true if any channel succeeds", async () => {
    (sendFollowUpReminderToSlack as any).mockRejectedValue(new Error("boom"));
    (sendAutomationMessage as any).mockResolvedValue({});
    const result = await sendFollowUpNotification({
      channels: [slackChannel, teamsChannel],
      ...baseArgs,
    });
    expect(result.anySucceeded).toBe(true);
  });

  it("returns anySucceeded=false when every channel fails", async () => {
    (sendFollowUpReminderToSlack as any).mockRejectedValue(new Error("boom"));
    (sendAutomationMessage as any).mockRejectedValue(new Error("boom"));
    const result = await sendFollowUpNotification({
      channels: [slackChannel, teamsChannel],
      ...baseArgs,
    });
    expect(result.anySucceeded).toBe(false);
  });

  it("skips Slack channel when access token is missing", async () => {
    const result = await sendFollowUpNotification({
      channels: [{ ...slackChannel, accessToken: null }],
      ...baseArgs,
    });
    expect(result.anySucceeded).toBe(false);
    expect(sendFollowUpReminderToSlack).not.toHaveBeenCalled();
  });
});
