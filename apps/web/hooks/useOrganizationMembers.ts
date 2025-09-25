import useSWR from "swr";
import type { OrganizationMembersResponse } from "@/app/api/organizations/[organizationId]/members/route";

export function useOrganizationMembers(organizationId: string) {
  return useSWR<OrganizationMembersResponse>(
    `/api/organizations/${organizationId}/members`,
  );
}
