import useSWR from "swr";
import type { DeepCleanSendersResponse } from "@/app/api/user/deep-clean/senders/route";
import type { BulkOperationProgress } from "@/app/api/user/deep-clean/progress/route";

export function useDeepCleanSenders() {
  return useSWR<DeepCleanSendersResponse>("/api/user/deep-clean/senders");
}

export function useBulkOperationProgress(refreshInterval?: number) {
  return useSWR<{ operations: BulkOperationProgress }>(
    "/api/user/deep-clean/progress",
    {
      refreshInterval,
    },
  );
}
