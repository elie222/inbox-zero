import useSWR from "swr";
import type { GetAttachmentsPreviewResponse } from "@/app/api/user/drive/preview/attachments/route";

export function useFilingPreviewAttachments(shouldFetch: boolean) {
  return useSWR<GetAttachmentsPreviewResponse>(
    shouldFetch ? "/api/user/drive/preview/attachments" : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
}
