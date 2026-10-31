import { useCallback } from "react";
import type {
  ConversationQuery,
  MailboxView,
  QuerySnapshot,
} from "@inboxzero/mail-core/queries";
import { useMailClient } from "./MailEngineProvider";
import { useQuerySnapshot } from "./use-query-snapshot";

export function useMailboxView(
  query: ConversationQuery,
): QuerySnapshot<MailboxView> {
  const client = useMailClient();
  const createHandle = useCallback(
    () => client.observeMailbox(query),
    [client, query],
  );
  return useQuerySnapshot(createHandle);
}
