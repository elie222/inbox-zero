import useSWR from "swr";
import type { GetBulkInboxActionJobResponse } from "@/app/api/user/bulk-inbox-action/[jobId]/route";

const POLL_INTERVAL_MS = 3000;

export function useBulkInboxActionJob(jobId: string | null) {
  return useSWR<GetBulkInboxActionJobResponse>(
    jobId ? `/api/user/bulk-inbox-action/${jobId}` : null,
    {
      refreshInterval: (job) =>
        !job || job.status === "RUNNING" ? POLL_INTERVAL_MS : 0,
    },
  );
}
