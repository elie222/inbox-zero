"use client";

import useSWR from "swr";
import type { TeamConversationsResponse } from "@/app/api/team-comments/conversations/route";

export function useTeamCommentsAvailable(emailAccountId: string | undefined) {
  const { data } = useSWR<TeamConversationsResponse>(
    emailAccountId ? "/api/team-comments/conversations" : null,
  );
  return Boolean(
    data?.memberships.some(
      (membership) =>
        membership.emailAccount.id === emailAccountId &&
        membership.organization._count.members > 1,
    ),
  );
}
