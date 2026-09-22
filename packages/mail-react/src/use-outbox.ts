import { useCallback } from "react";
import type { OutboxItem, QuerySnapshot } from "@inboxzero/mail-core/queries";
import { useMailClient } from "./MailEngineProvider";
import { useQuerySnapshot } from "./use-query-snapshot";

export function useOutbox(
  accountIds: string[],
): QuerySnapshot<{ items: OutboxItem[] }> {
  const client = useMailClient();
  const createHandle = useCallback(
    () => client.observeOutbox(accountIds),
    [client, accountIds],
  );
  return useQuerySnapshot(createHandle);
}
