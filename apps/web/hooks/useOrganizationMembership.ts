import useSWR from "swr";
import type { GetOrganizationMembershipResponse } from "@/app/api/user/organization-membership/route";

export function useOrganizationMembership(emailAccountId?: string) {
  return useSWR<GetOrganizationMembershipResponse>(
    emailAccountId
      ? ["/api/user/organization-membership", emailAccountId]
      : "/api/user/organization-membership",
  );
}
