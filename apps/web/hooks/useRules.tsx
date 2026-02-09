import useSWR from "swr";
import type { RulesResponse } from "@/app/api/user/rules/route";
import { useAccount } from "@/providers/EmailAccountProvider";
import { fetchWithAccount } from "@/utils/fetch";

export function useRules(emailAccountId?: string) {
  const { emailAccountId: activeEmailAccountId } = useAccount();
  const resolvedEmailAccountId = emailAccountId ?? activeEmailAccountId;

  return useSWR<RulesResponse, { error: string }>(
    resolvedEmailAccountId ? ["/api/user/rules", resolvedEmailAccountId] : null,
    fetchRules,
  );
}

async function fetchRules([url, emailAccountId]: [string, string]) {
  const res = await fetchWithAccount({
    url,
    emailAccountId,
  });

  if (!res.ok) {
    throw new Error("Failed to fetch rules");
  }

  return res.json();
}
