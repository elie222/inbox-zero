import useSWR from "swr";
import type { OrganizationRulesResponse } from "@/app/api/organizations/[organizationId]/rules/route";

export function useOrganizationRules(organizationId: string) {
  return useSWR<OrganizationRulesResponse>(
    `/api/organizations/${organizationId}/rules`,
  );
}
