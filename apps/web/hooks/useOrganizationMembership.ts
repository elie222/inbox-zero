import type { GetOrganizationMembershipResponse } from "@/app/api/user/organization-membership/route";
import { useSWRWithEmailAccount } from "@/utils/swr";

export function useOrganizationMembership() {
  return useSWRWithEmailAccount<GetOrganizationMembershipResponse>(
    "/api/user/organization-membership",
  );
}
