import { describe, expect, it } from "vitest";
import { MessagingProvider } from "@/generated/prisma/enums";
import {
  isAutomationMessagingChannelReady,
  isSupportedAutomationMessagingProvider,
} from "@/utils/automation-jobs/messaging-channel";
import { hasMessagingDeliveryTarget } from "@/utils/messaging/delivery-target";

describe("automation job messaging channel helpers", () => {
  it("accepts supported providers", () => {
    expect(
      isSupportedAutomationMessagingProvider(MessagingProvider.SLACK),
    ).toBe(true);
    expect(
      isSupportedAutomationMessagingProvider(MessagingProvider.TEAMS),
    ).toBe(true);
    expect(
      isSupportedAutomationMessagingProvider(MessagingProvider.TELEGRAM),
    ).toBe(true);
  });

  it("requires an explicit Slack destination", () => {
    expect(
      hasMessagingDeliveryTarget({
        provider: MessagingProvider.SLACK,
        providerUserId: null,
        channelId: "C123",
      }),
    ).toBe(true);
    expect(
      hasMessagingDeliveryTarget({
        provider: MessagingProvider.SLACK,
        providerUserId: "U123",
        channelId: "DM",
      }),
    ).toBe(true);
    expect(
      hasMessagingDeliveryTarget({
        provider: MessagingProvider.SLACK,
        providerUserId: "U123",
        channelId: null,
      }),
    ).toBe(false);
    expect(
      hasMessagingDeliveryTarget({
        provider: MessagingProvider.SLACK,
        providerUserId: null,
        channelId: null,
      }),
    ).toBe(false);
  });

  it("requires providerUserId for Teams destinations", () => {
    expect(
      hasMessagingDeliveryTarget({
        provider: MessagingProvider.TEAMS,
        providerUserId: "29:teams-user",
        channelId: null,
      }),
    ).toBe(true);
    expect(
      hasMessagingDeliveryTarget({
        provider: MessagingProvider.TELEGRAM,
        providerUserId: "12345",
        channelId: null,
      }),
    ).toBe(true);
    expect(
      hasMessagingDeliveryTarget({
        provider: MessagingProvider.TELEGRAM,
        providerUserId: null,
        teamId: "telegram-chat-1",
        channelId: null,
      }),
    ).toBe(true);
    expect(
      hasMessagingDeliveryTarget({
        provider: MessagingProvider.TEAMS,
        providerUserId: null,
        channelId: "channel-id-is-not-enough",
      }),
    ).toBe(false);
  });

  it("requires access token for Slack readiness", () => {
    expect(
      isAutomationMessagingChannelReady({
        provider: MessagingProvider.SLACK,
        isConnected: true,
        accessToken: "xoxb-token",
        providerUserId: "U123",
        channelId: "DM",
      }),
    ).toBe(true);

    expect(
      isAutomationMessagingChannelReady({
        provider: MessagingProvider.SLACK,
        isConnected: true,
        accessToken: null,
        providerUserId: "U123",
        channelId: "DM",
      }),
    ).toBe(false);
  });

  it("treats Teams and Telegram as ready when connected with destination", () => {
    expect(
      isAutomationMessagingChannelReady({
        provider: MessagingProvider.TEAMS,
        isConnected: true,
        accessToken: null,
        providerUserId: "29:teams-user",
        channelId: null,
      }),
    ).toBe(true);

    expect(
      isAutomationMessagingChannelReady({
        provider: MessagingProvider.TELEGRAM,
        isConnected: true,
        accessToken: null,
        providerUserId: null,
        teamId: "telegram-chat-1",
        channelId: null,
      }),
    ).toBe(true);
  });
});
