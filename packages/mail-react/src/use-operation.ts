import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { OperationKey } from "@inboxzero/mail-core/identities";
import type { OperationState } from "@inboxzero/mail-core/operations";
import type { QuerySnapshot } from "@inboxzero/mail-core/queries";
import { useMailClient } from "./MailEngineProvider";

export function useOperation(key: OperationKey): QuerySnapshot<OperationState> {
  const client = useMailClient();
  const handle = useMemo(() => client.observeOperation(key), [client, key]);
  useEffect(() => () => handle.close(), [handle]);
  return useSyncExternalStore(
    (listener) => handle.subscribe(listener),
    () => handle.getSnapshot(),
    () => handle.getSnapshot(),
  );
}
