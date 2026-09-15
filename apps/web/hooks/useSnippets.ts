import useSWR from "swr";
import type { GetSnippetsResponse } from "@/app/api/user/snippets/route";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getAccountScopedKey } from "@/utils/swr";

export function useSnippets() {
  const { emailAccountId } = useAccount();
  return useSWR<GetSnippetsResponse>(
    getAccountScopedKey("/api/user/snippets", emailAccountId),
  );
}
