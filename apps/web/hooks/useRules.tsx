import useSWR from "swr";
import type { RulesResponse } from "@/app/api/user/rules/route";

export function useRules() {
  return useSWR<RulesResponse, { error: string }>("/api/user/rules");
}
