import useSWR from "swr";
import type { GetExecutedRulesResponse } from "@/app/api/user/executed-rules/history/route";

export function useExecutedRules({
  page,
  ruleId,
  threadId,
}: {
  page: number;
  ruleId: string;
  threadId?: string;
}) {
  const params = new URLSearchParams({ page: String(page), ruleId });
  if (threadId) params.set("threadId", threadId);
  return useSWR<GetExecutedRulesResponse>(
    `/api/user/executed-rules/history?${params}`,
  );
}
