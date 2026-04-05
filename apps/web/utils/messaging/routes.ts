import type { Prisma } from "@/generated/prisma/client";
import {
  type MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";

export type MessagingRouteLike = {
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

export function getMessagingChannelRouteWhere(
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
