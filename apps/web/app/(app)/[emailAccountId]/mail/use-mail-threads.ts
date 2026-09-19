"use client";

import { useEngineMailThreads } from "@/app/(app)/[emailAccountId]/mail/use-engine-mail-threads";
import type { ThreadsQuery } from "@/utils/threads/validation";

export type { OptimisticThreadUpdate } from "@/app/(app)/[emailAccountId]/mail/use-engine-mail-threads";

export function useMailThreads({
  emailAccountId,
  query,
  enabled = true,
}: {
  emailAccountId: string;
  query: ThreadsQuery;
  enabled?: boolean;
}) {
  return useEngineMailThreads({
    emailAccountId,
    query,
    enabled,
  });
}
