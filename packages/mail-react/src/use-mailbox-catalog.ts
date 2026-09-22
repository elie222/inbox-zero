import { useCallback } from "react";
import type {
  MailboxCatalog,
  QuerySnapshot,
} from "@inboxzero/mail-core/queries";
import { useMailClient } from "./MailEngineProvider";
import { useQuerySnapshot } from "./use-query-snapshot";

export function useMailboxCatalog(
  accountId: string,
): QuerySnapshot<MailboxCatalog> {
  const client = useMailClient();
  const createHandle = useCallback(
    () => client.observeMailboxCatalog(accountId),
    [client, accountId],
  );
  return useQuerySnapshot(createHandle);
}
