"use client";

import useSWR from "swr";
import type { TeamConversationsResponse } from "@/app/api/team-comments/conversations/route";
import type { TeamUnreadCountResponse } from "@/app/api/team-comments/unread-count/route";
import { useAccount } from "@/providers/EmailAccountProvider";

export const TEAM_HREF = "/shared";
export const TEAM_UNREAD_COUNT_KEY = "/api/team-comments/unread-count";

/** Team follows the selected email account, like the rest of the app. */
export function useTeamMembership() {
  const { emailAccountId } = useAccount();
  const memberships = useSWR<TeamConversationsResponse>(
    "/api/team-comments/conversations",
  );
  const membership = memberships.data?.memberships.find(
    (member) => member.emailAccount.id === emailAccountId,
  );
  return { memberId: membership?.id ?? null, memberships };
}

/** The Team nav entry is only for accounts in an organization. */
export function useTeamNav() {
  const { memberId } = useTeamMembership();
  const hasTeam = Boolean(memberId);
  const { data: unread } = useSWR<TeamUnreadCountResponse>(
    hasTeam ? TEAM_UNREAD_COUNT_KEY : null,
    { refreshInterval: 60_000 },
  );
  return { hasTeam, unreadCount: unread?.count || null };
}
