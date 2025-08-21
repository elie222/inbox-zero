import type { RulesResponse } from "@/app/api/user/rules/route";
import { useSWRWithEmailAccount } from "@/utils/swr";

export function useRules() {
  return useSWRWithEmailAccount<RulesResponse, { error: string }>(
    "/api/user/rules",
  );
}
