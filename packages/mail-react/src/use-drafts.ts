import { useCallback } from "react";
import type { DraftSummary, QuerySnapshot } from "@inboxzero/mail-core/queries";
import { useMailClient } from "./MailEngineProvider";
import { useQuerySnapshot } from "./use-query-snapshot";

export function useDrafts(
  accountIds: string[],
): QuerySnapshot<{ drafts: DraftSummary[] }> {
  const client = useMailClient();
  const createHandle = useCallback(
    () => client.observeDrafts(accountIds),
    [client, accountIds],
  );
  return useQuerySnapshot(createHandle);
}
