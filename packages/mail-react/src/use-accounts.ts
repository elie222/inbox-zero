import { useCallback } from "react";
import type {
  AccountRecord,
  QuerySnapshot,
} from "@inboxzero/mail-core/queries";
import { useMailClient } from "./MailEngineProvider";
import { useQuerySnapshot } from "./use-query-snapshot";

export function useAccounts(): QuerySnapshot<{ accounts: AccountRecord[] }> {
  const client = useMailClient();
  const createHandle = useCallback(() => client.observeAccounts(), [client]);
  return useQuerySnapshot(createHandle);
}
