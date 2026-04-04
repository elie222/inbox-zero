import useSWR from "swr";
import type { GetFilingPreviewResponse } from "@/app/api/user/drive/preview/route";

export function useFilingPreview(shouldFetch: boolean) {
  return useSWR<GetFilingPreviewResponse>(
    shouldFetch ? "/api/user/drive/preview" : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
}
