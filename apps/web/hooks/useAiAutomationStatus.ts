import useSWR from "swr";
import type { GetAiAutomationStatusResponse } from "@/app/api/user/ai-automation-status/route";

export function useAiAutomationStatus() {
  return useSWR<GetAiAutomationStatusResponse>(
    "/api/user/ai-automation-status",
    {
      revalidateOnFocus: false,
    },
  );
}
