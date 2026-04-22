import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import { sendDigest } from "./send-digest";
import {
  resolveSlackRouteDestination,
  sendDigestToSlack,
} from "@/utils/messaging/providers/slack/send";
import { sendAutomationMessage } from "@/utils/automation-jobs/messaging";
import { sendDigestEmail } from "@inboxzero/resend";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/messaging/providers/slack/send", () => ({
  resolveSlackRouteDestination: vi.fn(),
  sendDigestToSlack: vi.fn(),
}));
vi.mock("@/utils/automation-jobs/messaging", () => ({
  sendAutomationMessage: vi.fn(),
}));
vi.mock("@inboxzero/resend", () => ({
  sendDigestEmail: vi.fn(),
}));

const logger = createScopedLogger("send-digest-test");

const baseArgs = {
  emailAccountId: "email-account-1",
  userEmail: "user@example.com",
  unsubscribeToken: "token-123",
  date: new Date("2026-04-21T09:00:00Z"),
  ruleNames: { newsletters: "Newsletters" },
  itemsByRule: {
    newsletters: [{ from: "Acme", subject: "Hello", content: "body" }],
  },
  logger,
};

const slackChannel = {
  id: "channel-1",
  provider: MessagingProvider.SLACK,
  isConnected: true,
  accessToken: "xoxb-token",
  teamId: "team-1",
  providerUserId: "U1",
  routes: [
    {
      purpose: MessagingRoutePurpose.DIGESTS,
      targetType: MessagingRouteTargetType.CHANNEL,
      targetId: "C1",
    },
  ],
};

describe("sendDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (resolveSlackRouteDestination as any).mockResolvedValue("C1");
  });

  it("sends email only when no channels are configured", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      digestSendEmail: true,
    } as any);
    prisma.messagingChannel.findMany.mockResolvedValue([]);

    await sendDigest(baseArgs);

    expect(sendDigestEmail).toHaveBeenCalledTimes(1);
    expect(sendDigestToSlack).not.toHaveBeenCalled();
    expect(sendAutomationMessage).not.toHaveBeenCalled();
  });

  it("sends to channels only when email is off", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      digestSendEmail: false,
    } as any);
    prisma.messagingChannel.findMany.mockResolvedValue([slackChannel] as any);

    await sendDigest(baseArgs);

    expect(sendDigestEmail).not.toHaveBeenCalled();
    expect(sendDigestToSlack).toHaveBeenCalledTimes(1);
    expect(sendDigestToSlack).toHaveBeenCalledWith(
      expect.not.objectContaining({
        unsubscribeUrl: expect.any(String),
      }),
    );
  });

  it("sends to both email and channels in parallel", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      digestSendEmail: true,
    } as any);
    prisma.messagingChannel.findMany.mockResolvedValue([slackChannel] as any);

    await sendDigest(baseArgs);

    expect(sendDigestEmail).toHaveBeenCalledTimes(1);
    expect(sendDigestToSlack).toHaveBeenCalledTimes(1);
  });

  it("throws when all delivery channels fail", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      digestSendEmail: true,
    } as any);
    prisma.messagingChannel.findMany.mockResolvedValue([slackChannel] as any);
    (sendDigestEmail as any).mockRejectedValue(new Error("email broke"));
    (sendDigestToSlack as any).mockRejectedValue(new Error("slack broke"));

    await expect(sendDigest(baseArgs)).rejects.toThrow(
      /All digest delivery channels failed/,
    );
  });

  it("does not throw when only some deliveries fail", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      digestSendEmail: true,
    } as any);
    prisma.messagingChannel.findMany.mockResolvedValue([slackChannel] as any);
    (sendDigestEmail as any).mockRejectedValue(new Error("email broke"));
    (sendDigestToSlack as any).mockResolvedValue(undefined);

    await expect(sendDigest(baseArgs)).resolves.toBeUndefined();
  });

  it("skips Slack when the access token is missing", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      digestSendEmail: false,
    } as any);
    prisma.messagingChannel.findMany.mockResolvedValue([
      { ...slackChannel, accessToken: null },
    ] as any);

    await expect(sendDigest(baseArgs)).rejects.toThrow(
      /No deliverable digest channels/,
    );
    expect(sendDigestToSlack).not.toHaveBeenCalled();
  });
});
