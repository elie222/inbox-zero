import useSWR from "swr";
import { useParams } from "next/navigation";
import type { ApiKeyResponse } from "@/app/api/user/api-keys/route";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { processSWRResponse } from "@/utils/swr";

export function useApiKeys() {
  const params = useParams<{ emailAccountId?: string }>();
  const emailAccountId = params.emailAccountId;

  const swrResult = useSWR<ApiKeyResponse | { error: string }>(
    emailAccountId ? "/api/user/api-keys" : null,
    (url: string) =>
      fetch(url, {
        headers: {
          [EMAIL_ACCOUNT_HEADER]: emailAccountId!,
        },
      }).then((res) => res.json()),
  );
  return processSWRResponse<ApiKeyResponse>(swrResult);
}
