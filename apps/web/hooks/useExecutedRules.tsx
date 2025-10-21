import useSWR from "swr";
import type { GetExecutedRulesResponse } from "@/app/api/user/executed-rules/history/route";

export function useExecutedRules({
  page,
  ruleId,
}: {
  page: number;
  ruleId: string;
}) {
  return useSWR<GetExecutedRulesResponse>(
    `/api/user/executed-rules/history?page=${page}&ruleId=${ruleId}`,
  );
}
