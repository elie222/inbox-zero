import useSWR from "swr";
import type { OrganizationResponse } from "@/app/api/organizations/[organizationId]/route";

export function useOrganization(organizationId: string) {
  return useSWR<OrganizationResponse>(`/api/organizations/${organizationId}`);
}
