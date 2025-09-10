import { useSession } from "@/utils/auth-client";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { fetchWithAccount } from "@/utils/fetch";

export function useOrgAccess() {
  const { data: session } = useSession();
  const params = useParams<{ emailAccountId: string | undefined }>();
  const emailAccountId = params.emailAccountId;

  const { data: emailAccount } = useSWR(
    emailAccountId ? "/api/user/email-account" : null,
    async (url) => {
      const response = await fetchWithAccount({ url, emailAccountId });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to fetch email account: ${response.status} ${errorText}`,
        );
      }
      return response.json();
    },
  );

  if (!session?.user?.email || !emailAccount) {
    return {
      isLoading: true,
      isAccountOwner: true,
      accountInfo: null,
    };
  }

  const isAccountOwner = emailAccount.email === session.user.email;

  return {
    isLoading: false,
    isAccountOwner,
    accountInfo: {
      email: emailAccount.email,
      name: emailAccount.name,
      image: emailAccount.image,
      provider: emailAccount.account?.provider,
    },
  };
}

export function isViewingDifferentAccount(
  currentUserEmail: string,
  emailAccountEmail: string | undefined,
): boolean {
  if (!emailAccountEmail) return false;
  return currentUserEmail !== emailAccountEmail;
}
