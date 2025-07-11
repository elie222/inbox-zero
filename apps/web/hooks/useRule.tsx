import useSWR from "swr";
import type { RuleResponse } from "@/app/api/user/rules/[id]/route";

export function useRule(ruleId?: string | null) {
  return useSWR<RuleResponse, { error: string }>(
    ruleId ? `/api/user/rules/${ruleId}` : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
}
