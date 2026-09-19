import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type {
  ConversationQuery,
  MailboxView,
  QuerySnapshot,
} from "@inboxzero/mail-core/queries";
import { useMailClient } from "./MailEngineProvider";

export function useMailboxView(
  query: ConversationQuery,
): QuerySnapshot<MailboxView> {
  const client = useMailClient();
  const handleRef = useRef<ReturnType<typeof client.observeMailbox> | null>(
    null,
  );
  const handle = useMemo(() => {
    handleRef.current?.close();
    const next = client.observeMailbox(query);
    handleRef.current = next;
    return next;
  }, [client, query]);
  useEffect(() => () => handle.close(), [handle]);
  return useSyncExternalStore(
    (listener) => handle.subscribe(listener),
    () => handle.getSnapshot(),
    () => handle.getSnapshot(),
  );
}
