import useSWR from "swr";
import type { GetExecutedRulesCountResponse } from "@/app/api/organizations/members/executed-rules-count/route";

export function useExecutedRulesCount() {
  return useSWR<GetExecutedRulesCountResponse>(
    "/api/organizations/members/executed-rules-count",
  );
}
