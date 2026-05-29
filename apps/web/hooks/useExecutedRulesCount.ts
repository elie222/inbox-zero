import useSWR from "swr";
import type { GetExecutedRulesCountResponse } from "@/app/api/organizations/[organizationId]/executed-rules-count/route";

export function useExecutedRulesCount(organizationId: string | null) {
  return useSWR<GetExecutedRulesCountResponse>(
    organizationId
      ? `/api/organizations/${organizationId}/executed-rules-count`
      : null,
  );
}
