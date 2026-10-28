import { useCallback } from "react";
import type { OperationKey } from "@inboxzero/mail-core/identities";
import type { OperationState } from "@inboxzero/mail-core/operations";
import type { QuerySnapshot } from "@inboxzero/mail-core/queries";
import { useMailClient } from "./MailEngineProvider";
import { useQuerySnapshot } from "./use-query-snapshot";

export function useOperation(key: OperationKey): QuerySnapshot<OperationState> {
  const client = useMailClient();
  const { accountId, operationId } = key;
  const createHandle = useCallback(
    () => client.observeOperation({ accountId, operationId }),
    [client, accountId, operationId],
  );
  return useQuerySnapshot(createHandle);
}
