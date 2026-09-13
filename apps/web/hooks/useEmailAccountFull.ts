import useSWR from "swr";
import type { EmailAccountFullResponse } from "@/app/api/user/email-account/route";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getAccountScopedKey, processSWRResponse } from "@/utils/swr";

export function useEmailAccountFull(emailAccountId?: string) {
  const { emailAccountId: contextAccountId } = useAccount();
  const accountId = emailAccountId ?? contextAccountId;
  const swrResult = useSWR<EmailAccountFullResponse | { error: string }>(
    getAccountScopedKey("/api/user/email-account", accountId || null),
  );
  return processSWRResponse<EmailAccountFullResponse>(swrResult);
}
