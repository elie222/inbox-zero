import { describe, expect, it } from "vitest";
import {
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import {
  canEnableMessagingFeatureRoute,
  getConnectedRuleNotificationChannels,
  getMessagingRouteSummary,
} from "./routes";

const routes = [
  {
    purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
    targetType: MessagingRouteTargetType.CHANNEL,
    targetId: "C123",
  },
  {
    purpose: MessagingRoutePurpose.MEETING_BRIEFS,
    targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
    targetId: "U123",
  },
];

describe("getMessagingRouteSummary", () => {
  it("builds a display-ready summary for a configured route", () => {
    expect(
      getMessagingRouteSummary(
        routes,
        MessagingRoutePurpose.RULE_NOTIFICATIONS,
      ),
    ).toEqual({
      enabled: true,
      targetId: "C123",
      targetLabel: "#C123",
      isDm: false,
    });
  });

  it("prefers a resolved target name when one is available", () => {
    expect(
      getMessagingRouteSummary(
        routes,
        MessagingRoutePurpose.RULE_NOTIFICATIONS,
        {
          C123: "#ops-alerts",
        },
      ),
    ).toEqual({
      enabled: true,
      targetId: "C123",
      targetLabel: "#ops-alerts",
      isDm: false,
    });
  });

  it("returns a disabled summary when no route exists", () => {
    expect(
      getMessagingRouteSummary(routes, MessagingRoutePurpose.DOCUMENT_FILINGS),
    ).toEqual({
      enabled: false,
      targetId: null,
      targetLabel: null,
      isDm: false,
    });
  });
});

describe("canEnableMessagingFeatureRoute", () => {
  it("allows a feature toggle when the feature route already exists", () => {
    expect(
      canEnableMessagingFeatureRoute(
        {
          ruleNotifications: {
            enabled: false,
            targetId: null,
            targetLabel: null,
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
        MessagingRoutePurpose.MEETING_BRIEFS,
      ),
    ).toBe(true);
  });

  it("requires either the feature route or the rule notification route", () => {
    expect(
      canEnableMessagingFeatureRoute(
        {
          ruleNotifications: {
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
        },
        MessagingRoutePurpose.DOCUMENT_FILINGS,
      ),
    ).toBe(false);
  });
});

describe("getConnectedRuleNotificationChannels", () => {
  it("keeps only connected channels with a rule notification route", () => {
    expect(
      getConnectedRuleNotificationChannels([
        {
          id: "channel-1",
          provider: MessagingProvider.SLACK,
          isConnected: true,
          destinations: {
            ruleNotifications: {
              enabled: true,
              targetId: "C123",
              targetLabel: "#C123",
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
        },
        {
          id: "channel-2",
          provider: MessagingProvider.TEAMS,
          isConnected: false,
          destinations: {
            ruleNotifications: {
              enabled: true,
              targetId: "29:teams-user",
              targetLabel: "Direct message",
              isDm: true,
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
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        id: "channel-1",
      }),
    ]);
  });
});
