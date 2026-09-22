import { useCallback } from "react";
import type { ConversationKey } from "@inboxzero/mail-core/identities";
import type { QuerySnapshot } from "@inboxzero/mail-core/queries";
import type { ConversationView } from "@inboxzero/mail-core/ports/mail-store";
import { useMailClient } from "./MailEngineProvider";
import { useQuerySnapshot } from "./use-query-snapshot";

export function useConversation(
  key: ConversationKey | null,
  page: { after: string | null; pageSize: number },
): QuerySnapshot<ConversationView> {
  const client = useMailClient();
  const accountId = key?.accountId;
  const conversationId = key?.conversationId;
  const { after, pageSize } = page;
  const createHandle = useCallback(() => {
    if (!accountId || !conversationId) return emptyConversationHandle();
    return client.observeConversation(
      { accountId, conversationId },
      { after, pageSize },
    );
  }, [client, accountId, conversationId, after, pageSize]);
  return useQuerySnapshot(createHandle);
}

function emptyConversationHandle() {
  const snapshot: QuerySnapshot<ConversationView> = {
    status: "ready",
    revision: null,
    data: null,
    refreshing: false,
    error: null,
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    close: () => undefined,
  };
}
