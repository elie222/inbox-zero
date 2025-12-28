import useSWR, { type SWRConfiguration } from "swr";
import type { GetAttachmentsPreviewResponse } from "@/app/api/user/drive/preview/attachments/route";

export function useFilingPreviewAttachments(
  shouldFetch: boolean,
  options?: SWRConfiguration,
) {
  return useSWR<GetAttachmentsPreviewResponse>(
    shouldFetch ? "/api/user/drive/preview/attachments" : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      ...options,
    },
  );
}
