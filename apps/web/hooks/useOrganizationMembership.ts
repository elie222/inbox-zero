import useSWR from "swr";
import type { GetOrganizationMembershipResponse } from "@/app/api/user/organization-membership/route";
import { useAccount } from "@/providers/EmailAccountProvider";

export function useOrganizationMembership(emailAccountId?: string) {
  const { emailAccountId: contextId, isLoading: isLoadingEmailAccount } =
    useAccount();
  const id = emailAccountId ?? contextId;
  const swr = useSWR<GetOrganizationMembershipResponse>(
    id ? ["/api/user/organization-membership", id] : null,
  );

  return {
    ...swr,
    // On organization routes there is no emailAccountId param, so the account
    // context resolves asynchronously. While it does, the SWR key is null and
    // SWR reports isLoading: false; treat membership as still loading so
    // consumers don't misread the gap as "no access".
    isLoading: swr.isLoading || (!id && isLoadingEmailAccount),
  };
}
