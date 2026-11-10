import useSWR from "swr";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getAccountScopedKey } from "@/utils/swr";
import type { GetBulkInboxActionJobResponse } from "@/app/api/user/bulk-inbox-action/[jobId]/route";

const POLL_INTERVAL_MS = 3000;

export function useBulkInboxActionJob(jobId: string | null) {
  const { emailAccountId } = useAccount();
  return useSWR<GetBulkInboxActionJobResponse>(
    jobId
      ? getAccountScopedKey(
          `/api/user/bulk-inbox-action/${jobId}`,
          emailAccountId || null,
        )
      : null,
    {
      refreshInterval: (job) =>
        !job || job.status === "RUNNING" ? POLL_INTERVAL_MS : 0,
    },
  );
}
