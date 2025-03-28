import useSWR from "swr";
import type { JobStatusResponse } from "@/app/api/clean/[jobId]/status/route";
import { JobStatus } from "@prisma/client";

export function useJobStatus(jobId: string | null) {
  const { data, error, isLoading } = useSWR<JobStatusResponse>(
    jobId ? `/api/clean/${jobId}/status` : null,
    {
      refreshInterval: 2000,
      refreshWhenHidden: false, // Don't poll when tab is in background
      refreshWhenOffline: false,
      onSuccess: (data) => {
        if (data.status === JobStatus.RUNNING) {
          return 2000; // Continue polling every 2 seconds
        }

        // Stop polling by setting refresh interval to 0
        return 0;
      },
    },
  );

  return {
    data,
    error,
    isLoading,
  };
}
