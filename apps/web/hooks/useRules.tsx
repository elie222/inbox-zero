import useSWR from "swr";
import type { RulesResponse } from "@/app/api/user/rules/route";
import { useAccount } from "@/providers/EmailAccountProvider";

export function useRules(emailAccountId?: string) {
  const { emailAccountId: contextId } = useAccount();
  const id = emailAccountId ?? contextId;
  return useSWR<RulesResponse, { error: string }>(
    id ? ["/api/user/rules", id] : null,
  );
}
