import useSWR from "swr";
import type { GetAutomationJobResponse } from "@/app/api/user/automation-jobs/route";
import { getAccountScopedKey } from "@/utils/swr";

export function useAutomationJob(emailAccountId?: string | null) {
  return useSWR<GetAutomationJobResponse>(
    getAccountScopedKey("/api/user/automation-jobs", emailAccountId),
  );
}
