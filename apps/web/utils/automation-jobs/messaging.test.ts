import { describe, expect, it } from "vitest";
import {
  MessagingProvider,
  MessagingRoutePurpose,
} from "@/generated/prisma/enums";
import {
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

  it("requires a rule notification route before a channel is ready", () => {
    expect(
      isAutomationMessagingChannelReady(
        createAutomationChannel({
          provider: MessagingProvider.SLACK,
          accessToken: "xoxb-token",
          routes: [],
        }),
      ),
    ).toBe(false);
  });

  it("requires an access token for Slack readiness", () => {
    expect(
      isAutomationMessagingChannelReady(
        createAutomationChannel({
          provider: MessagingProvider.SLACK,
          accessToken: "xoxb-token",
          providerUserId: "U123",
        }),
      ),
    ).toBe(true);

    expect(
      isAutomationMessagingChannelReady(
        createAutomationChannel({
          provider: MessagingProvider.SLACK,
          accessToken: null,
          providerUserId: "U123",
        }),
      ),
    ).toBe(false);

    expect(
      isAutomationMessagingChannelReady(
        createAutomationChannel({
          provider: MessagingProvider.SLACK,
          accessToken: "xoxb-token",
          providerUserId: null,
        }),
      ),
    ).toBe(false);
  });

  it("requires a provider user id for Teams readiness", () => {
    expect(
      isAutomationMessagingChannelReady(
        createAutomationChannel({
          provider: MessagingProvider.TEAMS,
          accessToken: null,
          providerUserId: "29:teams-user",
        }),
      ),
    ).toBe(true);

    expect(
      isAutomationMessagingChannelReady(
        createAutomationChannel({
          provider: MessagingProvider.TEAMS,
          accessToken: null,
          providerUserId: null,
        }),
      ),
    ).toBe(false);
  });

  it("treats Telegram as ready when connected with a route", () => {
    expect(
      isAutomationMessagingChannelReady(
        createAutomationChannel({
          provider: MessagingProvider.TELEGRAM,
          accessToken: null,
        }),
      ),
    ).toBe(true);
  });
});

function createAutomationChannel({
  provider,
  accessToken,
  providerUserId = null,
  routes = [
    {
      purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
      targetId: "destination-1",
    },
  ],
}: {
  provider: MessagingProvider;
  accessToken: string | null;
  providerUserId?: string | null;
  routes?: Array<{
    purpose: MessagingRoutePurpose;
    targetId: string;
  }>;
}) {
  return {
    provider,
    isConnected: true,
    accessToken,
    providerUserId,
    routes,
  };
}
