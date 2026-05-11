import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import {
  createMessagingLinkCodeAction,
  toggleRuleChannelAction,
  updateSlackRouteAction,
  updateMessagingFeatureRouteAction,
} from "@/utils/actions/messaging-channels";
import {
  getChannelInfo,
  listChannels,
  listPrivateChannelsForUser,
} from "@/utils/messaging/providers/slack/channels";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";
import { sendChannelConfirmation } from "@/utils/messaging/providers/slack/send";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/utils/messaging/providers/slack/channels", () => ({
  getChannelInfo: vi.fn(),
  listChannels: vi.fn(),
  listPrivateChannelsForUser: vi.fn(),
}));
vi.mock("@/utils/messaging/providers/slack/client", () => ({
  createSlackClient: vi.fn(),
}));
vi.mock("@/utils/messaging/providers/slack/send", () => ({
  sendChannelConfirmation: vi.fn(),
}));

const { mockEnv, generateMessagingLinkCodeMock } = vi.hoisted(() => ({
  mockEnv: {
    TEAMS_BOT_APP_ID: "teams-app-id" as string | undefined,
    TEAMS_BOT_APP_PASSWORD: "teams-app-password",
    TELEGRAM_BOT_TOKEN: "telegram-bot-token" as string | undefined,
  },
  generateMessagingLinkCodeMock: vi.fn(
    (_args: { emailAccountId: string; provider: string }) => "test-link-code",
  ),
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

vi.mock("@/utils/messaging/chat-sdk/link-code", () => ({
  LINKABLE_MESSAGING_PROVIDERS: ["TEAMS", "TELEGRAM"],
  generateMessagingLinkCode: (args: {
    emailAccountId: string;
    provider: "TEAMS" | "TELEGRAM";
  }) => generateMessagingLinkCodeMock(args),
}));

describe("createMessagingLinkCodeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockEnv.TEAMS_BOT_APP_ID = "teams-app-id";
    mockEnv.TEAMS_BOT_APP_PASSWORD = "teams-app-password";
    mockEnv.TELEGRAM_BOT_TOKEN = "telegram-bot-token";

    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: {
        userId: "user-1",
        provider: "google",
      },
    } as any);
  });

  it("returns a Teams connect code when Teams is configured", async () => {
    const result = await createMessagingLinkCodeAction(
      "email-account-1" as any,
      {
        provider: "TEAMS",
      },
    );

    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toEqual({
      code: "test-link-code",
      provider: "TEAMS",
      expiresInSeconds: 600,
    });
  });

  it("returns an error when Teams is not configured", async () => {
    mockEnv.TEAMS_BOT_APP_ID = undefined;

    const result = await createMessagingLinkCodeAction(
      "email-account-1" as any,
      {
        provider: "TEAMS",
      },
    );

    expect(result?.serverError).toBe("Teams integration is not configured");
    expect(generateMessagingLinkCodeMock).not.toHaveBeenCalled();
  });

  it("returns a Telegram connect code and bot URL when Telegram is configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          ok: true,
          result: { username: "inboxdevbot" },
        }),
      } as any),
    );

    const result = await createMessagingLinkCodeAction(
      "email-account-1" as any,
      {
        provider: "TELEGRAM",
      },
    );

    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toEqual({
      code: "test-link-code",
      provider: "TELEGRAM",
      expiresInSeconds: 600,
      botUrl: "https://t.me/inboxdevbot",
    });

    vi.unstubAllGlobals();
  });

  it("returns an error when Telegram is not configured", async () => {
    mockEnv.TELEGRAM_BOT_TOKEN = undefined;

    const result = await createMessagingLinkCodeAction(
      "email-account-1" as any,
      {
        provider: "TELEGRAM",
      },
    );

    expect(result?.serverError).toBe("Telegram integration is not configured");
    expect(generateMessagingLinkCodeMock).not.toHaveBeenCalled();
  });
});

describe("updateMessagingFeatureRouteAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: {
        userId: "user-1",
        provider: "google",
      },
    } as any);
  });

  it("allows Telegram features when the DM chat id is present", async () => {
    prisma.messagingChannel.findUnique.mockResolvedValue({
      id: "channel-1",
      emailAccountId: "email-account-1",
      provider: "TELEGRAM",
      isConnected: true,
      routes: [
        {
          purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
          targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
          targetId: "telegram-chat-1",
        },
      ],
    } as any);

    const result = await updateMessagingFeatureRouteAction(
      "email-account-1" as any,
      {
        channelId: "channel-1",
        purpose: MessagingRoutePurpose.MEETING_BRIEFS,
        enabled: true,
      },
    );

    expect(result?.serverError).toBeUndefined();
    expect(prisma.messagingRoute.create).toHaveBeenCalledWith({
      data: {
        messagingChannelId: "channel-1",
        purpose: MessagingRoutePurpose.MEETING_BRIEFS,
        targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
        targetId: "telegram-chat-1",
      },
    });
  });

  it("still requires a selected target route for Teams features", async () => {
    prisma.messagingChannel.findUnique.mockResolvedValue({
      id: "channel-1",
      emailAccountId: "email-account-1",
      provider: "TEAMS",
      isConnected: true,
      accessToken: null,
      providerUserId: "29:teams-user",
      routes: [],
    } as any);

    const result = await updateMessagingFeatureRouteAction(
      "email-account-1" as any,
      {
        channelId: "channel-1",
        purpose: MessagingRoutePurpose.MEETING_BRIEFS,
        enabled: true,
      },
    );

    expect(result?.serverError).toBe(
      "Please select a target channel before enabling features",
    );
    expect(prisma.messagingChannel.update).not.toHaveBeenCalled();
  });

  it("requires reconnecting Teams before enabling features", async () => {
    prisma.messagingChannel.findUnique.mockResolvedValue({
      id: "channel-1",
      emailAccountId: "email-account-1",
      provider: "TEAMS",
      isConnected: true,
      accessToken: null,
      providerUserId: null,
      routes: [],
    } as any);

    const result = await updateMessagingFeatureRouteAction(
      "email-account-1" as any,
      {
        channelId: "channel-1",
        purpose: MessagingRoutePurpose.MEETING_BRIEFS,
        enabled: true,
      },
    );

    expect(result?.serverError).toBe(
      "Please reconnect Teams before configuring notifications.",
    );
  });
});

describe("updateSlackRouteAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: {
        userId: "user-1",
        provider: "google",
      },
    } as any);
  });

  it("rejects private Slack channels the user is not a member of", async () => {
    prisma.messagingChannel.findUnique.mockResolvedValue({
      provider: "SLACK",
      isConnected: true,
      accessToken: "xoxb-token",
      providerUserId: "U123",
      botUserId: "B123",
    } as any);
    vi.mocked(createSlackClient).mockReturnValue({} as never);
    vi.mocked(getChannelInfo).mockResolvedValue({
      id: "C123",
      name: "private-alerts",
      isPrivate: true,
    });
    vi.mocked(listPrivateChannelsForUser).mockResolvedValue([
      {
        id: "C999",
        name: "other-private-channel",
        isPrivate: true,
      },
    ]);

    const result = await updateSlackRouteAction("email-account-1" as any, {
      channelId: "channel-1",
      purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
      targetId: "C123",
    });

    expect(result?.serverError).toBe(
      "Only private channels you are a member of are allowed. Please select one of your private channels.",
    );
    expect(prisma.messagingRoute.upsert).not.toHaveBeenCalled();
    expect(sendChannelConfirmation).not.toHaveBeenCalled();
  });

  it("rejects private Slack channels when the Slack user id is missing", async () => {
    prisma.messagingChannel.findUnique.mockResolvedValue({
      provider: "SLACK",
      isConnected: true,
      accessToken: "xoxb-token",
      providerUserId: null,
      botUserId: "B123",
    } as any);
    vi.mocked(createSlackClient).mockReturnValue({} as never);
    vi.mocked(getChannelInfo).mockResolvedValue({
      id: "C123",
      name: "private-alerts",
      isPrivate: true,
    });

    const result = await updateSlackRouteAction("email-account-1" as any, {
      channelId: "channel-1",
      purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
      targetId: "C123",
    });

    expect(result?.serverError).toBe(
      "Please reconnect Slack before configuring notifications.",
    );
    expect(listChannels).not.toHaveBeenCalled();
    expect(listPrivateChannelsForUser).not.toHaveBeenCalled();
    expect(prisma.messagingRoute.upsert).not.toHaveBeenCalled();
  });

  it("upserts scheduled check-in Slack routes", async () => {
    prisma.messagingChannel.findUnique.mockResolvedValue({
      id: "channel-1",
      provider: "SLACK",
      isConnected: true,
      accessToken: "xoxb-token",
      providerUserId: "U123",
      botUserId: "B123",
    } as any);
    vi.mocked(createSlackClient).mockReturnValue({} as never);
    vi.mocked(getChannelInfo).mockResolvedValue({
      id: "C123",
      name: "check-ins",
      isPrivate: true,
    });
    vi.mocked(listPrivateChannelsForUser).mockResolvedValue([
      {
        id: "C123",
        name: "check-ins",
        isPrivate: true,
      },
    ]);

    const result = await updateSlackRouteAction("email-account-1" as any, {
      channelId: "channel-1",
      purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
      targetId: "C123",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.messagingRoute.upsert).toHaveBeenCalledWith({
      where: {
        messagingChannelId_purpose: {
          messagingChannelId: "channel-1",
          purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
        },
      },
      update: {
        targetType: MessagingRouteTargetType.CHANNEL,
        targetId: "C123",
      },
      create: {
        messagingChannelId: "channel-1",
        purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
        targetType: MessagingRouteTargetType.CHANNEL,
        targetId: "C123",
      },
    });
    expect(sendChannelConfirmation).toHaveBeenCalledWith({
      accessToken: "xoxb-token",
      channelId: "C123",
      botUserId: "B123",
    });
  });
});

describe("toggleRuleChannelAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: {
        userId: "user-1",
        provider: "google",
      },
    } as any);
  });

  it("allows Telegram notifications when the DM chat id is present", async () => {
    prisma.rule.findUnique.mockResolvedValue({
      emailAccountId: "email-account-1",
      actions: [],
    } as any);
    prisma.messagingChannel.findUnique.mockResolvedValue({
      emailAccountId: "email-account-1",
      provider: "TELEGRAM",
      isConnected: true,
      routes: [
        {
          purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
          targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
          targetId: "telegram-chat-1",
        },
      ],
    } as any);

    const result = await toggleRuleChannelAction("email-account-1" as any, {
      ruleId: "rule-1",
      messagingChannelId: "channel-1",
      enabled: true,
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.action.deleteMany).toHaveBeenCalledWith({
      where: {
        ruleId: "rule-1",
        messagingChannelId: "channel-1",
        type: { in: ["NOTIFY_MESSAGING_CHANNEL", "DRAFT_MESSAGING_CHANNEL"] },
      },
    });
    expect(prisma.action.create).toHaveBeenCalledWith({
      data: {
        emailAccountId: "email-account-1",
        messagingChannelEmailAccountId: "email-account-1",
        type: "NOTIFY_MESSAGING_CHANNEL",
        ruleId: "rule-1",
        messagingChannelId: "channel-1",
      },
    });
  });

  it("falls back to NOTIFY when the client requests DRAFT but the rule has no DRAFT_EMAIL action", async () => {
    prisma.rule.findUnique.mockResolvedValue({
      emailAccountId: "email-account-1",
      actions: [],
    } as any);
    prisma.messagingChannel.findUnique.mockResolvedValue({
      emailAccountId: "email-account-1",
      provider: "SLACK",
      isConnected: true,
      accessToken: "xoxb-token",
      providerUserId: "U123",
      routes: [
        {
          purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
          targetType: MessagingRouteTargetType.CHANNEL,
          targetId: "C123",
        },
      ],
    } as any);

    const result = await toggleRuleChannelAction("email-account-1" as any, {
      ruleId: "rule-1",
      messagingChannelId: "channel-1",
      enabled: true,
      actionType: "DRAFT_MESSAGING_CHANNEL",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.action.create).toHaveBeenCalledWith({
      data: {
        emailAccountId: "email-account-1",
        messagingChannelEmailAccountId: "email-account-1",
        type: "NOTIFY_MESSAGING_CHANNEL",
        ruleId: "rule-1",
        messagingChannelId: "channel-1",
      },
    });
  });

  it("creates DRAFT_MESSAGING_CHANNEL when the rule has a DRAFT_EMAIL action", async () => {
    prisma.rule.findUnique.mockResolvedValue({
      emailAccountId: "email-account-1",
      actions: [{ id: "draft-action-1" }],
    } as any);
    prisma.messagingChannel.findUnique.mockResolvedValue({
      emailAccountId: "email-account-1",
      provider: "SLACK",
      isConnected: true,
      accessToken: "xoxb-token",
      providerUserId: "U123",
      routes: [
        {
          purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
          targetType: MessagingRouteTargetType.CHANNEL,
          targetId: "C123",
        },
      ],
    } as any);

    const result = await toggleRuleChannelAction("email-account-1" as any, {
      ruleId: "rule-1",
      messagingChannelId: "channel-1",
      enabled: true,
      actionType: "DRAFT_MESSAGING_CHANNEL",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.action.create).toHaveBeenCalledWith({
      data: {
        emailAccountId: "email-account-1",
        messagingChannelEmailAccountId: "email-account-1",
        type: "DRAFT_MESSAGING_CHANNEL",
        ruleId: "rule-1",
        messagingChannelId: "channel-1",
      },
    });
  });

  it("requires reconnecting Teams before enabling notifications", async () => {
    prisma.rule.findUnique.mockResolvedValue({
      emailAccountId: "email-account-1",
      actions: [],
    } as any);
    prisma.messagingChannel.findUnique.mockResolvedValue({
      emailAccountId: "email-account-1",
      provider: "TEAMS",
      isConnected: true,
      accessToken: null,
      providerUserId: null,
      routes: [
        {
          purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
          targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
          targetId: "29:teams-user",
        },
      ],
    } as any);

    const result = await toggleRuleChannelAction("email-account-1" as any, {
      ruleId: "rule-1",
      messagingChannelId: "channel-1",
      enabled: true,
    });

    expect(result?.serverError).toBe(
      "Please reconnect Teams before configuring notifications.",
    );
    expect(prisma.action.create).not.toHaveBeenCalled();
  });
});
