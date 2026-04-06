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

type MessagingRoutePurposeLike = Pick<MessagingRouteLike, "purpose">;

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
  | typeof MessagingRoutePurpose.MEETING_BRIEFS
  | typeof MessagingRoutePurpose.DOCUMENT_FILINGS;

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
  routes: MessagingRoutePurposeLike[] | null | undefined,
  purpose: MessagingRoutePurpose,
) {
  if (!routes) return false;
  return routes.some((route) => route.purpose === purpose);
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

export function formatRouteTargetLabelWithNames(
  route: MessagingRouteLike | null,
  targetNamesById?: Record<string, string>,
) {
  if (!route) return null;
  if (isDirectMessageRoute(route)) return "Direct message";
  return targetNamesById?.[route.targetId] ?? formatRouteTargetLabel(route);
}

export function getMessagingRouteSummary(
  routes: MessagingRouteLike[] | null | undefined,
  purpose: MessagingRoutePurpose,
  targetNamesById?: Record<string, string>,
): MessagingRouteSummary {
  const route = getMessagingRoute(routes, purpose);

  return {
    enabled: Boolean(route),
    targetId: route?.targetId ?? null,
    targetLabel: formatRouteTargetLabelWithNames(route, targetNamesById),
    isDm: isDirectMessageRoute(route),
  };
}

export function getMessagingFeatureRouteSummary(
  destinations: MessagingChannelDestinations,
  purpose: MessagingFeatureRoutePurpose,
): MessagingRouteSummary {
  if (purpose === MessagingRoutePurpose.MEETING_BRIEFS) {
    return destinations.meetingBriefs;
  }

  return destinations.documentFilings;
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
