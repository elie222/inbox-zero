import { describe, expect, it } from "vitest";
import {
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import {
  canEnableMessagingFeatureRoute,
  canSetupScheduledCheckInsRoute,
  getConnectedRuleNotificationChannels,
  getConnectedScheduledCheckInsSetupChannels,
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

describe("scheduled check-in setup helpers", () => {
  it("allows setup from either a scheduled check-in route or a rule route", () => {
    expect(
      canSetupScheduledCheckInsRoute({
        ruleNotifications: disabledRoute,
        scheduledCheckIns: {
          enabled: true,
          targetId: "C456",
          targetLabel: "#check-ins",
          isDm: false,
        },
        meetingBriefs: disabledRoute,
        documentFilings: disabledRoute,
        digests: disabledRoute,
        followUps: disabledRoute,
      }),
    ).toBe(true);

    expect(
      canSetupScheduledCheckInsRoute({
        ruleNotifications: {
          enabled: true,
          targetId: "C123",
          targetLabel: "#rules",
          isDm: false,
        },
        scheduledCheckIns: disabledRoute,
        meetingBriefs: disabledRoute,
        documentFilings: disabledRoute,
        digests: disabledRoute,
        followUps: disabledRoute,
      }),
    ).toBe(true);
  });

  it("keeps connected channels with either scheduled check-in setup route", () => {
    expect(
      getConnectedScheduledCheckInsSetupChannels([
        {
          id: "channel-1",
          isConnected: true,
          destinations: {
            ruleNotifications: disabledRoute,
            scheduledCheckIns: {
              enabled: true,
              targetId: "C456",
              targetLabel: "#check-ins",
              isDm: false,
            },
            meetingBriefs: disabledRoute,
            documentFilings: disabledRoute,
            digests: disabledRoute,
            followUps: disabledRoute,
          },
        },
        {
          id: "channel-2",
          isConnected: true,
          destinations: {
            ruleNotifications: {
              enabled: true,
              targetId: "C123",
              targetLabel: "#rules",
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
          id: "channel-3",
          isConnected: false,
          destinations: {
            ruleNotifications: {
              enabled: true,
              targetId: "C999",
              targetLabel: "#stale",
              isDm: false,
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
      expect.objectContaining({ id: "channel-1" }),
      expect.objectContaining({ id: "channel-2" }),
    ]);
  });
});
