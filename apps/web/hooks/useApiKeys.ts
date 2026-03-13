import useSWR from "swr";
import type { ApiKeyResponse } from "@/app/api/user/api-keys/route";
import { useAccount } from "@/providers/EmailAccountProvider";
import { processSWRResponse } from "@/utils/swr";

export function useApiKeys() {
  const { emailAccountId } = useAccount();

  const swrResult = useSWR<ApiKeyResponse | { error: string }>(
    emailAccountId ? ["/api/user/api-keys", emailAccountId] : null,
  );
  return processSWRResponse<ApiKeyResponse>(swrResult);
}
