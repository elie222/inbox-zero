import { useParams } from "next/navigation";
import useSWR from "swr";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";

interface MemberInfo {
  name: string;
  email: string;
}

export function useMemberAnalytics() {
  const params = useParams<{ emailAccountId: string }>();
  const currentEmailAccountId = params.emailAccountId;

  const { data: userEmailAccounts } = useSWR<GetEmailAccountsResponse>(
    "/api/user/email-accounts",
  );
  const userOwnEmailAccountId = userEmailAccounts?.emailAccounts?.[0]?.id;

  const isOwnAnalytics = currentEmailAccountId === userOwnEmailAccountId;

  const { data: memberInfo, error: memberInfoError } = useSWR<MemberInfo>(
    !isOwnAnalytics && currentEmailAccountId
      ? `/api/organizations/member-info/${currentEmailAccountId}`
      : null,
  );

  return {
    isOwnAnalytics,
    memberInfo,
    memberInfoError,
    currentEmailAccountId,
  };
}
