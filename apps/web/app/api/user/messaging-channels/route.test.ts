import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/__mocks__/prisma";
import { listChannels } from "@/utils/messaging/providers/slack/channels";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";

const { isAppReviewDemoAccountEmailMock, isPosthogFeatureEnabledMock } =
  vi.hoisted(() => ({
    isAppReviewDemoAccountEmailMock: vi.fn(),
    isPosthogFeatureEnabledMock: vi.fn(),
  }));

vi.mock("@/utils/app-review-demo", () => ({
  isAppReviewDemoAccountEmail: isAppReviewDemoAccountEmailMock,
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware();
});
vi.mock("@/utils/messaging/providers/slack/channels", () => ({
  listChannels: vi.fn(),
}));
vi.mock("@/utils/messaging/providers/slack/client", () => ({
  createSlackClient: vi.fn(),
}));
vi.mock("@/utils/posthog", () => ({
  isPosthogFeatureEnabled: isPosthogFeatureEnabledMock,
}));

const mockEnv = vi.hoisted(() => ({
  SLACK_CLIENT_ID: "slack-client-id" as string | undefined,
  SLACK_CLIENT_SECRET: "slack-client-secret" as string | undefined,
  TEAMS_BOT_APP_ID: undefined as string | undefined,
  TEAMS_BOT_APP_PASSWORD: undefined as string | undefined,
  TELEGRAM_BOT_TOKEN: undefined as string | undefined,
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

import { getAvailableMessagingProviders } from "@/utils/messaging/available-providers";
import { GET } from "./route";

const messagingChannelSelect = {
  id: true,
  provider: true,
  teamName: true,
  teamId: true,
  providerUserId: true,
  accessToken: true,
  isConnected: true,
  routes: {
    select: {
      purpose: true,
      targetType: true,
      targetId: true,
    },
  },
  actions: {
    select: {
      id: true,
      type: true,
      ruleId: true,
      rule: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.MessagingChannelSelect;

type MessagingChannelRecord = Prisma.MessagingChannelGetPayload<{
  select: typeof messagingChannelSelect;
}>;

describe("GET /api/user/messaging-channels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.SLACK_CLIENT_ID = "slack-client-id";
    mockEnv.SLACK_CLIENT_SECRET = "slack-client-secret";
    mockEnv.TEAMS_BOT_APP_ID = undefined;
    mockEnv.TEAMS_BOT_APP_PASSWORD = undefined;
    mockEnv.TELEGRAM_BOT_TOKEN = undefined;
    isAppReviewDemoAccountEmailMock.mockReturnValue(false);
    isPosthogFeatureEnabledMock.mockResolvedValue(false);
  });

  it("omits provider user ids while returning route summaries", async () => {
    const channels = [
      {
        id: "channel-1",
        provider: "SLACK",
        teamName: null,
        teamId: "team-1",
        providerUserId: "U123",
        accessToken: "xoxb-token",
        isConnected: true,
        routes: [
          {
            purpose: "RULE_NOTIFICATIONS",
            targetType: "CHANNEL",
            targetId: "C123",
          },
          {
            purpose: "MEETING_BRIEFS",
            targetType: "DIRECT_MESSAGE",
            targetId: "U123",
          },
          {
            purpose: "SCHEDULED_CHECK_INS",
            targetType: "CHANNEL",
            targetId: "C456",
          },
        ],
        actions: [],
      },
    ] satisfies MessagingChannelRecord[];
    prisma.messagingChannel.findMany.mockResolvedValue(channels);
    vi.mocked(createSlackClient).mockReturnValue({} as never);
    vi.mocked(listChannels).mockResolvedValue([
      {
        id: "C123",
        name: "ops-alerts",
        isPrivate: true,
      },
      {
        id: "C456",
        name: "check-ins",
        isPrivate: true,
      },
    ]);

    const response = await GET(createRequest());
    const body = await response.json();

    expect(body.channels).toEqual([
      {
        id: "channel-1",
        provider: "SLACK",
        teamName: null,
        teamId: "team-1",
        isConnected: true,
        actions: [],
        canSendAsDm: true,
        destinations: {
          ruleNotifications: {
            enabled: true,
            targetId: "C123",
            targetLabel: "#ops-alerts",
            isDm: false,
          },
          scheduledCheckIns: {
            enabled: true,
            targetId: "C456",
            targetLabel: "#check-ins",
            isDm: false,
          },
          meetingBriefs: {
            enabled: true,
            targetId: "U123",
            targetLabel: "Direct message",
            isDm: true,
          },
          documentFilings: {
            enabled: false,
            targetId: null,
            targetLabel: null,
            isDm: false,
          },
          digests: {
            enabled: false,
            targetId: null,
            targetLabel: null,
            isDm: false,
          },
          followUps: {
            enabled: false,
            targetId: null,
            targetLabel: null,
            isDm: false,
          },
        },
      },
    ]);
    expect(body.channels[0]).not.toHaveProperty("providerUserId");
    expect(body.channels[0]).not.toHaveProperty("accessToken");
    expect(body.availableProviders).toEqual(["SLACK"]);
  });

  it("reuses a workspace target lookup for channels with the same Slack token", async () => {
    const channels = [
      {
        id: "channel-1",
        provider: "SLACK",
        teamName: "Workspace",
        teamId: "team-1",
        providerUserId: "U123",
        accessToken: "xoxb-shared-token",
        isConnected: true,
        routes: [
          {
            purpose: "RULE_NOTIFICATIONS",
            targetType: "CHANNEL",
            targetId: "C123",
          },
        ],
        actions: [],
      },
      {
        id: "channel-2",
        provider: "SLACK",
        teamName: "Workspace",
        teamId: "team-1",
        providerUserId: "U456",
        accessToken: "xoxb-shared-token",
        isConnected: true,
        routes: [
          {
            purpose: "RULE_NOTIFICATIONS",
            targetType: "CHANNEL",
            targetId: "C123",
          },
        ],
        actions: [],
      },
    ] satisfies MessagingChannelRecord[];
    prisma.messagingChannel.findMany.mockResolvedValue(channels);
    vi.mocked(createSlackClient).mockReturnValue({} as never);
    vi.mocked(listChannels).mockResolvedValue([
      {
        id: "C123",
        name: "ops-alerts",
        isPrivate: true,
      },
    ]);

    const response = await GET(createRequest());
    const body = await response.json();

    expect(createSlackClient).toHaveBeenCalledTimes(1);
    expect(listChannels).toHaveBeenCalledTimes(1);
    expect(body.channels).toEqual([
      expect.objectContaining({
        id: "channel-1",
        destinations: {
          ruleNotifications: {
            enabled: true,
            targetId: "C123",
            targetLabel: "#ops-alerts",
            isDm: false,
          },
          scheduledCheckIns: {
            enabled: false,
            targetId: null,
            targetLabel: null,
            isDm: false,
          },
          meetingBriefs: {
            enabled: false,
            targetId: null,
            targetLabel: null,
            isDm: false,
          },
          documentFilings: {
            enabled: false,
            targetId: null,
            targetLabel: null,
            isDm: false,
          },
          digests: {
            enabled: false,
            targetId: null,
            targetLabel: null,
            isDm: false,
          },
          followUps: {
            enabled: false,
            targetId: null,
            targetLabel: null,
            isDm: false,
          },
        },
      }),
      expect.objectContaining({
        id: "channel-2",
        destinations: {
          ruleNotifications: {
            enabled: true,
            targetId: "C123",
            targetLabel: "#ops-alerts",
            isDm: false,
          },
          scheduledCheckIns: {
            enabled: false,
            targetId: null,
            targetLabel: null,
            isDm: false,
          },
          meetingBriefs: {
            enabled: false,
            targetId: null,
            targetLabel: null,
            isDm: false,
          },
          documentFilings: {
            enabled: false,
            targetId: null,
            targetLabel: null,
            isDm: false,
          },
          digests: {
            enabled: false,
            targetId: null,
            targetLabel: null,
            isDm: false,
          },
          followUps: {
            enabled: false,
            targetId: null,
            targetLabel: null,
            isDm: false,
          },
        },
      }),
    ]);
  });

  it("marks invalid Slack and Teams connections as disconnected", async () => {
    const channels = [
      {
        id: "channel-1",
        provider: "SLACK",
        teamName: "Workspace",
        teamId: "team-1",
        providerUserId: null,
        accessToken: "xoxb-shared-token",
        isConnected: true,
        routes: [],
        actions: [],
      },
      {
        id: "channel-2",
        provider: "TEAMS",
        teamName: "Workspace",
        teamId: "team-2",
        providerUserId: null,
        accessToken: null,
        isConnected: true,
        routes: [],
        actions: [],
      },
    ] satisfies MessagingChannelRecord[];
    prisma.messagingChannel.findMany.mockResolvedValue(channels);

    const response = await GET(createRequest());
    const body = await response.json();

    expect(createSlackClient).not.toHaveBeenCalled();
    expect(listChannels).not.toHaveBeenCalled();
    expect(body.channels).toEqual([
      expect.objectContaining({
        id: "channel-1",
        isConnected: false,
        canSendAsDm: false,
      }),
      expect.objectContaining({
        id: "channel-2",
        isConnected: false,
        canSendAsDm: false,
      }),
    ]);
  });

  it("returns Teams when the authenticated email has early access enabled", async () => {
    mockEnv.TEAMS_BOT_APP_ID = "teams-app-id";
    mockEnv.TEAMS_BOT_APP_PASSWORD = "teams-password";
    isPosthogFeatureEnabledMock.mockResolvedValue(true);
    prisma.messagingChannel.findMany.mockResolvedValue([]);

    const response = await GET(createRequest());
    const body = await response.json();

    expect(body.availableProviders).toEqual(["SLACK", "TEAMS"]);
    expect(isPosthogFeatureEnabledMock).toHaveBeenCalledWith({
      distinctId: "user@example.com",
      flagKey: "microsoft-teams",
    });
  });

  it("hides Teams when early access is not enabled", async () => {
    mockEnv.TEAMS_BOT_APP_ID = "teams-app-id";
    mockEnv.TEAMS_BOT_APP_PASSWORD = "teams-password";

    await expect(
      getAvailableMessagingProviders({ email: "user@example.com" }),
    ).resolves.toEqual(["SLACK"]);
  });

  it("allows Teams for configured app review demo accounts", async () => {
    mockEnv.TEAMS_BOT_APP_ID = "teams-app-id";
    mockEnv.TEAMS_BOT_APP_PASSWORD = "teams-password";
    isAppReviewDemoAccountEmailMock.mockReturnValue(true);

    await expect(
      getAvailableMessagingProviders({ email: "Reviewer@Example.com" }),
    ).resolves.toEqual(["SLACK", "TEAMS"]);
    expect(isAppReviewDemoAccountEmailMock).toHaveBeenCalledWith(
      "reviewer@example.com",
    );
    expect(isPosthogFeatureEnabledMock).not.toHaveBeenCalled();
  });
});

function createRequest() {
  return new NextRequest("http://localhost:3000/api/user/messaging-channels");
}
