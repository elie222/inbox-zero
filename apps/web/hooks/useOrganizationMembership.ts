import useSWR from "swr";
import type { GetOrganizationMembershipResponse } from "@/app/api/user/organization-membership/route";
import { useAccount } from "@/providers/EmailAccountProvider";
import { fetchWithAccount } from "@/utils/fetch";

export function useOrganizationMembership(emailAccountId?: string) {
  const { emailAccountId: activeEmailAccountId } = useAccount();
  const resolvedEmailAccountId = emailAccountId ?? activeEmailAccountId;

  return useSWR<GetOrganizationMembershipResponse>(
    resolvedEmailAccountId
      ? ["/api/user/organization-membership", resolvedEmailAccountId]
      : null,
    fetchOrganizationMembership,
  );
}

async function fetchOrganizationMembership([url, emailAccountId]: [
  string,
  string,
]): Promise<GetOrganizationMembershipResponse> {
  const res = await fetchWithAccount({
    url,
    emailAccountId,
  });

  if (!res.ok) {
    throw new Error("Failed to fetch organization membership");
  }

  return res.json();
}
