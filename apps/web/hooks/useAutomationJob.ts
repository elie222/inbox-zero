import useSWR from "swr";
import type { GetAutomationJobResponse } from "@/app/api/user/automation-jobs/route";

export function useAutomationJob(emailAccountId?: string | null) {
  return useSWR<GetAutomationJobResponse>(
    getAccountScopedKey("/api/user/automation-jobs", emailAccountId),
  );
}

function getAccountScopedKey(path: string, emailAccountId?: string | null) {
  if (emailAccountId === undefined) return path;

  return emailAccountId ? ([path, emailAccountId] as const) : null;
}
