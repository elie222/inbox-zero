import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", () => ({
  withEmailAccount: (_name: string, handler: unknown) => handler,
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

describe("GET /api/user/messaging-channels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("omits provider user ids while returning route summaries", async () => {
    prisma.messagingChannel.findMany.mockResolvedValue([
      {
        id: "channel-1",
        provider: "SLACK",
        teamName: null,
        teamId: "team-1",
        providerUserId: "U123",
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
    ] as any);

    const response = await GET({
      auth: {
        emailAccountId: "email-account-1",
      },
    } as any);
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
            targetLabel: "#C123",
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
    expect(body.availableProviders).toEqual(["SLACK"]);
  });
});
