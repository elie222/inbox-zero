import type { EmailAccountFullResponse } from "@/app/api/user/email-account/route";
import { processSWRResponse, useSWRWithEmailAccount } from "@/utils/swr";

export function useEmailAccountFull() {
  const swrResult = useSWRWithEmailAccount<
    EmailAccountFullResponse | { error: string }
  >("/api/user/email-account");
  return processSWRResponse<EmailAccountFullResponse>(swrResult);
}
