import useSWR from "swr";
import type { GetAutomationJobResponse } from "@/app/api/user/automation-jobs/route";
import { useAccount } from "@/providers/EmailAccountProvider";

export function useAutomationJob(emailAccountId?: string) {
  const { emailAccountId: contextId } = useAccount();
  const id = emailAccountId ?? contextId;

  return useSWR<GetAutomationJobResponse>(
    id ? ["/api/user/automation-jobs", id] : null,
  );
}
