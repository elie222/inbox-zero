import useSWR from "swr";
import type { OrganizationTeamsResponse } from "@/app/api/organizations/[organizationId]/teams/route";

export function useOrganizationTeams(organizationId: string | null) {
  return useSWR<OrganizationTeamsResponse>(
    organizationId ? `/api/organizations/${organizationId}/teams` : null,
  );
}
