import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import {
  createMessagingLinkCodeAction,
  toggleRuleChannelAction,
  updateMessagingFeatureRouteAction,
} from "@/utils/actions/messaging-channels";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
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

  it("still requires a provider user id for Teams features", async () => {
    prisma.messagingChannel.findUnique.mockResolvedValue({
      id: "channel-1",
      emailAccountId: "email-account-1",
      provider: "TEAMS",
      isConnected: true,
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
});
