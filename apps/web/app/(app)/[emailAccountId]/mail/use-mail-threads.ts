"use client";

import { useMemo } from "react";
import {
  MAX_MESSAGE_PREDICATE_IDS,
  type MailPredicate,
} from "@inboxzero/mail-core/queries";
import { useEngineMailThreads } from "@/app/(app)/[emailAccountId]/mail/use-engine-mail-threads";
import { useHiddenDraftMessageIds } from "@/hooks/useHiddenDraftMessageIds";
import { threadsQueryToPredicate } from "@/utils/mail-engine/threads-query";
import type { ThreadsQuery } from "@/utils/threads/validation";

export function useMailThreads({
  emailAccountId,
  query,
  enabled = true,
}: {
  emailAccountId: string;
  query: ThreadsQuery;
  enabled?: boolean;
}) {
  const hiddenDraftMessageIds = useHiddenDraftMessageIds(emailAccountId);
  // A conversation stays in Drafts only through drafts that aren't hidden.
  const predicate = useMemo<MailPredicate | undefined>(
    () =>
      query.type === "draft" && hiddenDraftMessageIds.length
        ? {
            kind: "all",
            predicates: [
              threadsQueryToPredicate(query),
              {
                kind: "not",
                predicate: {
                  kind: "message",
                  ids: hiddenDraftMessageIds.slice(-MAX_MESSAGE_PREDICATE_IDS),
                },
              },
            ],
          }
        : undefined,
    [query, hiddenDraftMessageIds],
  );
  return useEngineMailThreads({
    emailAccountId,
    query,
    predicate,
    enabled,
  });
}
