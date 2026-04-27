import { describe, expect, it } from "vitest";
import {
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import {
  canEnableMessagingFeatureRoute,
  getConnectedRuleNotificationChannels,
  getMessagingChannelTargetRouteWhere,
  getMessagingRouteSummary,
  hasMessagingChannelTargetRoute,
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
  {
    purpose: MessagingRoutePurpose.SCHEDULED_CHECK_INS,
    targetType: MessagingRouteTargetType.CHANNEL,
    targetId: "C456",
  },
];

const disabledRoute = {
  enabled: false,
  targetId: null,
  targetLabel: null,
  isDm: false,
};

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

describe("messaging channel target route helpers", () => {
  it("matches channel routes without caring about their purpose", () => {
    expect(hasMessagingChannelTargetRoute(routes, "C123")).toBe(true);
    expect(hasMessagingChannelTargetRoute(routes, "C456")).toBe(true);
    expect(hasMessagingChannelTargetRoute(routes, "U123")).toBe(false);
  });

  it("builds a purpose-agnostic channel target filter", () => {
    expect(getMessagingChannelTargetRouteWhere("C123")).toEqual({
      targetType: MessagingRouteTargetType.CHANNEL,
      targetId: "C123",
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
          scheduledCheckIns: disabledRoute,
          meetingBriefs: {
            enabled: true,
            targetId: "U123",
            targetLabel: "Direct message",
            isDm: true,
          },
          documentFilings: disabledRoute,
          digests: disabledRoute,
          followUps: disabledRoute,
        },
        MessagingRoutePurpose.MEETING_BRIEFS,
      ),
    ).toBe(true);
  });

  it("requires either the feature route or the rule notification route", () => {
    expect(
      canEnableMessagingFeatureRoute(
        {
          ruleNotifications: disabledRoute,
          scheduledCheckIns: disabledRoute,
          meetingBriefs: disabledRoute,
          documentFilings: disabledRoute,
          digests: disabledRoute,
          followUps: disabledRoute,
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
            scheduledCheckIns: disabledRoute,
            meetingBriefs: disabledRoute,
            documentFilings: disabledRoute,
            digests: disabledRoute,
            followUps: disabledRoute,
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
            scheduledCheckIns: disabledRoute,
            meetingBriefs: disabledRoute,
            documentFilings: disabledRoute,
            digests: disabledRoute,
            followUps: disabledRoute,
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
