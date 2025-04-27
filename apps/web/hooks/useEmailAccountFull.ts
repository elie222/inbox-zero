import useSWR from "swr";
import type { EmailAccountFullResponse } from "@/app/api/user/email-account/route";
import { processSWRResponse } from "@/utils/swr"; // Import the generic helper

export function useEmailAccountFull() {
  const swrResult = useSWR<EmailAccountFullResponse | { error: string }>(
    "/api/user/email-account",
  );
  return processSWRResponse<EmailAccountFullResponse>(swrResult);
}
