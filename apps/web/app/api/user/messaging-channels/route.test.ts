import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import type { RequestWithEmailAccount } from "@/utils/middleware";
import { listChannels } from "@/utils/messaging/providers/slack/channels";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", () => ({
  withEmailAccount: (_name: string, handler: unknown) => handler,
}));
vi.mock("@/utils/messaging/providers/slack/channels", () => ({
  listChannels: vi.fn(),
}));
vi.mock("@/utils/messaging/providers/slack/client", () => ({
  createSlackClient: vi.fn(),
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

const logger = createScopedLogger("test");

describe("GET /api/user/messaging-channels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    const response = await GET(createRequest("email-account-1"));
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

    const response = await GET(createRequest("email-account-1"));
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
        },
      }),
    ]);
  });
});

function createRequest(emailAccountId: string): RequestWithEmailAccount {
  return Object.assign(
    new NextRequest("http://localhost:3000/api/user/messaging-channels"),
    {
      logger,
      auth: {
        userId: "user-1",
        emailAccountId,
        email: "user@example.com",
      },
    },
  );
}
