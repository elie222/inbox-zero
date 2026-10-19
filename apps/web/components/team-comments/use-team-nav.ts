"use client";

import useSWR from "swr";
import type { TeamConversationsResponse } from "@/app/api/team-comments/conversations/route";
import type { TeamUnreadCountResponse } from "@/app/api/team-comments/unread-count/route";

export const TEAM_HREF = "/shared";

/** The Team nav entry is only for users in an organization. */
export function useTeamNav() {
  const { data: memberships } = useSWR<TeamConversationsResponse>(
    "/api/team-comments/conversations",
  );
  const hasTeam = Boolean(memberships?.memberships.length);
  const { data: unread } = useSWR<TeamUnreadCountResponse>(
    hasTeam ? "/api/team-comments/unread-count" : null,
    { refreshInterval: 60_000 },
  );
  return { hasTeam, unreadCount: unread?.count || null };
}
