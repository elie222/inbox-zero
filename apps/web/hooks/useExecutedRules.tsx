import useSWR from "swr";
import type { GetExecutedRulesResponse } from "@/app/api/user/planned/history/route";

export function useExecutedRules({
  page,
  ruleId,
}: {
  page: number;
  ruleId: string;
}) {
  return useSWR<GetExecutedRulesResponse>(
    `/api/user/planned/history?page=${page}&ruleId=${ruleId}`,
  );
}
