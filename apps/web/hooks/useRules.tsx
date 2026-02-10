import useSWR from "swr";
import type { RulesResponse } from "@/app/api/user/rules/route";

export function useRules(emailAccountId?: string) {
  return useSWR<RulesResponse, { error: string }>(
    emailAccountId ? ["/api/user/rules", emailAccountId] : "/api/user/rules",
  );
}
