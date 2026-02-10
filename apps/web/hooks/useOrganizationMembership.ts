import useSWR from "swr";
import type { GetOrganizationMembershipResponse } from "@/app/api/user/organization-membership/route";
import { useAccount } from "@/providers/EmailAccountProvider";

export function useOrganizationMembership(emailAccountId?: string) {
  const { emailAccountId: contextId } = useAccount();
  const id = emailAccountId ?? contextId;
  return useSWR<GetOrganizationMembershipResponse>(
    id ? ["/api/user/organization-membership", id] : null,
  );
}
