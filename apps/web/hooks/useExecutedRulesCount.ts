import useSWR from "swr";
import type { GetExecutedRulesCountResponse } from "@/app/api/organizations/[organizationId]/executed-rules-count/route";

export function useExecutedRulesCount(organizationId: string) {
  return useSWR<GetExecutedRulesCountResponse>(
    `/api/organizations/${organizationId}/executed-rules-count`,
  );
}
