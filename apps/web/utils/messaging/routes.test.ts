import { describe, expect, it } from "vitest";
import {
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import { getMessagingRouteSummary } from "./routes";

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
