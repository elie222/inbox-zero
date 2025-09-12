import { useSession } from "@/utils/auth-client";
import { useParams } from "next/navigation";
import { useOrgSWR } from "@/hooks/useOrgSWR";
import type { EmailAccountFullResponse } from "@/app/api/user/email-account/route";

export function useOrgAccess() {
  const { data: session } = useSession();
  const params = useParams<{ emailAccountId: string | undefined }>();
  const emailAccountId = params.emailAccountId;

  const { data: emailAccount, isLoading } = useOrgSWR<EmailAccountFullResponse>(
    emailAccountId ? "/api/user/email-account" : null,
  );

  if (!session?.user?.email) {
    return {
      isLoading: true,
      isAccountOwner: true,
      accountInfo: null,
    };
  }

  if (isLoading || !emailAccount) {
    return {
      isLoading: true,
      isAccountOwner: true,
      accountInfo: null,
    };
  }

  const isAccountOwner = emailAccount.user.id === session.user.id;

  return {
    isLoading: false,
    isAccountOwner,
    accountInfo: {
      email: emailAccount.email,
      name: emailAccount.name,
      image: emailAccount.image,
      provider: undefined, // Provider not available in this response
    },
  };
}
