import useSWR from "swr";
import type { GetAutomationJobResponse } from "@/app/api/user/automation-jobs/route";

export function useAutomationJob() {
  return useSWR<GetAutomationJobResponse>("/api/user/automation-jobs");
}
