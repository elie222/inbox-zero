import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { createScopedLogger } from "@/utils/logger";
import { sendBriefing } from "./send-briefing";
import {
  resolveSlackRouteDestination,
  sendMeetingBriefingToSlack,
} from "@/utils/messaging/providers/slack/send";
import { sendAutomationMessage } from "@/utils/automation-jobs/messaging";

vi.mock("@/utils/prisma");
vi.mock("@/utils/messaging/providers/slack/send", () => ({
  resolveSlackRouteDestination: vi.fn(),
  sendMeetingBriefingToSlack: vi.fn(),
}));
vi.mock("@/utils/automation-jobs/messaging", () => ({
  sendAutomationMessage: vi.fn(),
}));
vi.mock("@/utils/date", () => ({
  formatTimeInUserTimezone: vi.fn(() => "Monday, Jan 1 at 10:00 AM"),
}));

const logger = createScopedLogger("send-briefing-test");

const event: CalendarEvent = {
  id: "event-1",
  title: "Sync",
  startTime: new Date("2026-04-17T10:00:00Z"),
  endTime: new Date("2026-04-17T11:00:00Z"),
  videoConferenceLink: null,
  eventUrl: null,
} as any;

const briefingContent = {
  guests: [],
  internalTeamMembers: [],
} as any;

describe("sendBriefing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue({
      meetingBriefsSendEmail: false,
    } as any);
  });

  it("skips Slack delivery when the channel is missing a provider user id", async () => {
    prisma.messagingChannel.findMany.mockResolvedValue([
      {
        id: "channel-1",
        provider: MessagingProvider.SLACK,
        isConnected: true,
        accessToken: "xoxb-token",
        teamId: "team-1",
        providerUserId: null,
        routes: [
          {
            purpose: MessagingRoutePurpose.MEETING_BRIEFS,
            targetType: MessagingRouteTargetType.CHANNEL,
            targetId: "C1",
          },
        ],
      },
    ] as any);

    await sendBriefing({
      event,
      briefingContent,
      internalTeamMembers: [],
      emailAccountId: "email-account-1",
      userEmail: "user@example.com",
      provider: "google",
      userTimezone: null,
      logger,
    });

    expect(resolveSlackRouteDestination).not.toHaveBeenCalled();
    expect(sendMeetingBriefingToSlack).not.toHaveBeenCalled();
  });

  it("skips Teams delivery when the channel is missing a provider user id", async () => {
    prisma.messagingChannel.findMany.mockResolvedValue([
      {
        id: "channel-2",
        provider: MessagingProvider.TEAMS,
        isConnected: true,
        accessToken: null,
        teamId: "team-2",
        providerUserId: null,
        routes: [
          {
            purpose: MessagingRoutePurpose.MEETING_BRIEFS,
            targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
            targetId: "29:teams-user",
          },
        ],
      },
    ] as any);

    await sendBriefing({
      event,
      briefingContent,
      internalTeamMembers: [],
      emailAccountId: "email-account-1",
      userEmail: "user@example.com",
      provider: "google",
      userTimezone: null,
      logger,
    });

    expect(sendAutomationMessage).not.toHaveBeenCalled();
  });
});
