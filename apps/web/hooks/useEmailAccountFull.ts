import useSWR from "swr";
import type { EmailAccountFullResponse } from "@/app/api/user/email-account/route";
import { getAccountScopedKey, processSWRResponse } from "@/utils/swr";

export function useEmailAccountFull(emailAccountId?: string) {
  const swrResult = useSWR<EmailAccountFullResponse | { error: string }>(
    getAccountScopedKey("/api/user/email-account", emailAccountId),
  );
  return processSWRResponse<EmailAccountFullResponse>(swrResult);
}
