import useSWR from "swr";
import type { GetThreadPlansResponse } from "@/app/api/user/thread-plans/route";
import { getAccountScopedKey } from "@/utils/swr";

export function useThreadPlans({
  threadId,
  emailAccountId,
}: {
  threadId: string | null | undefined;
  emailAccountId?: string | null;
}) {
  const path =
    threadId && emailAccountId
      ? `/api/user/thread-plans?threadId=${encodeURIComponent(threadId)}`
      : null;
  return useSWR<GetThreadPlansResponse>(
    path ? getAccountScopedKey(path, emailAccountId) : null,
  );
}
