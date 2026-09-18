import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ConversationKey } from "@inboxzero/mail-core/identities";
import type { QuerySnapshot } from "@inboxzero/mail-core/queries";
import type { ConversationView } from "@inboxzero/mail-core/ports/mail-store";
import { useMailClient } from "./MailEngineProvider";

export function useConversation(
  key: ConversationKey,
  page: { after: string | null; pageSize: number },
): QuerySnapshot<ConversationView> {
  const client = useMailClient();
  const handle = useMemo(
    () => client.observeConversation(key, page),
    [client, key, page],
  );
  useEffect(() => () => handle.close(), [handle]);
  return useSyncExternalStore(
    (listener) => handle.subscribe(listener),
    () => handle.getSnapshot(),
    () => handle.getSnapshot(),
  );
}
