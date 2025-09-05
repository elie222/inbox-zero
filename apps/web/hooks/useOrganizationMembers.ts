import useSWR from "swr";
import type { OrganizationMembersResponse } from "@/app/api/organizations/members/route";

export function useOrganizationMembers() {
  return useSWR<OrganizationMembersResponse>("/api/organizations/members");
}
