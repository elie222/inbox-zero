import type { Prisma } from "@/generated/prisma/client";
import {
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";

type MessagingRouteLike = {
  purpose: MessagingRoutePurpose;
  targetType: MessagingRouteTargetType;
  targetId: string;
};

export type MessagingRouteSummary = {
  enabled: boolean;
  targetId: string | null;
  targetLabel: string | null;
  isDm: boolean;
};

export type MessagingChannelDestinations = {
  ruleNotifications: MessagingRouteSummary;
  meetingBriefs: MessagingRouteSummary;
  documentFilings: MessagingRouteSummary;
};

export type MessagingFeatureRoutePurpose =
  | MessagingRoutePurpose.MEETING_BRIEFS
  | MessagingRoutePurpose.DOCUMENT_FILINGS;

type ConnectedMessagingChannelLike = {
  isConnected: boolean;
  destinations: MessagingChannelDestinations;
};

export function getMessagingRoute(
  routes: MessagingRouteLike[] | null | undefined,
  purpose: MessagingRoutePurpose,
) {
  if (!routes) return null;
  return routes.find((route) => route.purpose === purpose) ?? null;
}

export function hasMessagingRoute(
  routes: MessagingRouteLike[] | null | undefined,
  purpose: MessagingRoutePurpose,
) {
  return Boolean(getMessagingRoute(routes, purpose));
}

export function getMessagingRouteWhere(
  purpose: MessagingRoutePurpose,
): Prisma.MessagingChannelWhereInput {
  return {
    routes: {
      some: {
        purpose,
      },
    },
  };
}

export function isDirectMessageRoute(route: MessagingRouteLike | null) {
  return route?.targetType === MessagingRouteTargetType.DIRECT_MESSAGE;
}

export function formatRouteTargetLabel(route: MessagingRouteLike | null) {
  if (!route) return null;
  if (isDirectMessageRoute(route)) return "Direct message";
  return `#${route.targetId}`;
}

export function getMessagingRouteSummary(
  routes: MessagingRouteLike[] | null | undefined,
  purpose: MessagingRoutePurpose,
): MessagingRouteSummary {
  const route = getMessagingRoute(routes, purpose);

  return {
    enabled: Boolean(route),
    targetId: route?.targetId ?? null,
    targetLabel: formatRouteTargetLabel(route),
    isDm: isDirectMessageRoute(route),
  };
}

export function getMessagingFeatureRouteSummary(
  destinations: MessagingChannelDestinations,
  purpose: MessagingFeatureRoutePurpose,
) {
  switch (purpose) {
    case MessagingRoutePurpose.MEETING_BRIEFS:
      return destinations.meetingBriefs;
    case MessagingRoutePurpose.DOCUMENT_FILINGS:
      return destinations.documentFilings;
  }
}

export function hasRuleNotificationRoute(
  destinations: MessagingChannelDestinations,
) {
  return destinations.ruleNotifications.enabled;
}

export function canEnableMessagingFeatureRoute(
  destinations: MessagingChannelDestinations,
  purpose: MessagingFeatureRoutePurpose,
) {
  return (
    getMessagingFeatureRouteSummary(destinations, purpose).enabled ||
    hasRuleNotificationRoute(destinations)
  );
}

export function getConnectedRuleNotificationChannels<
  T extends ConnectedMessagingChannelLike,
>(channels: T[] | null | undefined) {
  return (channels ?? []).filter(
    (channel) =>
      channel.isConnected && hasRuleNotificationRoute(channel.destinations),
  );
}
