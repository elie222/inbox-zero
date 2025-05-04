import useSWR from "swr";
import type { ApiKeyResponse } from "@/app/api/user/api-keys/route";
import { processSWRResponse } from "@/utils/swr";

export function useApiKeys() {
  const swrResult = useSWR<ApiKeyResponse | { error: string }>(
    "/api/user/api-keys",
  );
  return processSWRResponse<ApiKeyResponse>(swrResult);
}
