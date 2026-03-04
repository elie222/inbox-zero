import { describe, expect, it } from "vitest";
import { MessagingProvider } from "@/generated/prisma/enums";
import {
  formatAutomationMessagingChannelLabel,
  hasAutomationMessagingDestination,
  isAutomationMessagingChannelReady,
  isSupportedAutomationMessagingProvider,
} from "@/utils/automation-jobs/messaging-channel";

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

  it("requires slack destination via DM user or channel", () => {
    expect(
      hasAutomationMessagingDestination({
        provider: MessagingProvider.SLACK,
        providerUserId: null,
        channelId: "C123",
      }),
    ).toBe(true);
    expect(
      hasAutomationMessagingDestination({
        provider: MessagingProvider.SLACK,
        providerUserId: "U123",
        channelId: null,
      }),
    ).toBe(true);
    expect(
      hasAutomationMessagingDestination({
        provider: MessagingProvider.SLACK,
        providerUserId: null,
        channelId: null,
      }),
    ).toBe(false);
  });

  it("requires providerUserId for Teams and Telegram destinations", () => {
    expect(
      hasAutomationMessagingDestination({
        provider: MessagingProvider.TEAMS,
        providerUserId: "29:teams-user",
        channelId: null,
      }),
    ).toBe(true);
    expect(
      hasAutomationMessagingDestination({
        provider: MessagingProvider.TELEGRAM,
        providerUserId: "12345",
        channelId: null,
      }),
    ).toBe(true);
    expect(
      hasAutomationMessagingDestination({
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
        channelId: null,
      }),
    ).toBe(true);

    expect(
      isAutomationMessagingChannelReady({
        provider: MessagingProvider.SLACK,
        isConnected: true,
        accessToken: null,
        providerUserId: "U123",
        channelId: null,
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
        providerUserId: "12345",
        channelId: null,
      }),
    ).toBe(true);
  });

  it("formats channel labels with provider-specific fallbacks", () => {
    expect(
      formatAutomationMessagingChannelLabel({
        provider: MessagingProvider.SLACK,
        channelName: null,
        channelId: "C123",
        teamName: null,
      }),
    ).toBe("Slack workspace");

    expect(
      formatAutomationMessagingChannelLabel({
        provider: MessagingProvider.SLACK,
        channelName: null,
        channelId: null,
        teamName: null,
      }),
    ).toBe("Slack workspace");

    expect(
      formatAutomationMessagingChannelLabel({
        provider: MessagingProvider.TEAMS,
        channelName: null,
        channelId: null,
        teamName: null,
      }),
    ).toBe("Teams destination");

    expect(
      formatAutomationMessagingChannelLabel({
        provider: MessagingProvider.TELEGRAM,
        channelName: null,
        channelId: null,
        teamName: null,
      }),
    ).toBe("Telegram destination");
  });

  it("supports showing team name alongside channel name", () => {
    expect(
      formatAutomationMessagingChannelLabel(
        {
          provider: MessagingProvider.SLACK,
          channelName: "inbox-updates",
          channelId: null,
          teamName: "Acme",
        },
        { includeTeamNameWithChannel: true },
      ),
    ).toBe("#inbox-updates (Acme)");

    expect(
      formatAutomationMessagingChannelLabel({
        provider: MessagingProvider.SLACK,
        channelName: "inbox-updates",
        channelId: null,
        teamName: "Acme",
      }),
    ).toBe("#inbox-updates");
  });
});
