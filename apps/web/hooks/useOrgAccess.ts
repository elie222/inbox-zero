import { useSession } from "@/utils/auth-client";
import { useParams } from "next/navigation";
import { useOrgSWR } from "@/hooks/useOrgSWR";
import type { EmailAccountFullResponse } from "@/app/api/user/email-account/route";

export function useOrgAccess() {
  const { data: session } = useSession();
  const params = useParams<{ emailAccountId: string | undefined }>();
  const emailAccountId = params.emailAccountId;

  const {
    data: emailAccount,
    isLoading,
    error,
  } = useOrgSWR<EmailAccountFullResponse>(
    emailAccountId ? "/api/user/email-account" : null,
  );

  if (!session?.user?.email) {
    return {
      isLoading: true,
      isAccountOwner: false,
      accountInfo: null,
    };
  }

  if (isLoading || !emailAccount || !emailAccount.user || error) {
    return {
      isLoading: true,
      isAccountOwner: false,
      accountInfo: null,
    };
  }

  const isAccountOwner = emailAccount.user.id === session.user.id;

  const accountInfo = isAccountOwner
    ? null
    : {
        email: emailAccount.email,
        name: emailAccount.name,
        image: emailAccount.image,
        provider: undefined,
      };

  return {
    isLoading: false,
    isAccountOwner,
    accountInfo,
  };
}
