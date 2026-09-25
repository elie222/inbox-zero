import {
  nodeBodyCodec,
  openOrQuarantineNodeMailbox,
  nodeMailCrypto,
} from "@inboxzero/mail-sqlite/node";
import type { SqliteDriver } from "@inboxzero/mail-sqlite/driver";
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";
import { createHostRuntime } from "@inboxzero/mail-core/engine";
import type { MailStore } from "@inboxzero/mail-core/ports/mail-store";

export type SqliteTransactionTimer = (
  kind: "read" | "write",
  durationMs: number,
) => void;

export async function createDesktopMailStore(
  path: string,
  onTransaction?: SqliteTransactionTimer,
): Promise<MailStore> {
  const { driver } = await openOrQuarantineNodeMailbox(path);
  return createSqliteMailStore(
    onTransaction ? timeTransactions(driver, onTransaction) : driver,
    { runtime: createHostRuntime(nodeMailCrypto()), bodyCodec: nodeBodyCodec },
  );
}

export { nodeMailCrypto };

// Timed from the call, so a transaction queued behind others on its connection
// counts the wait the caller actually felt.
function timeTransactions(
  driver: SqliteDriver,
  onTransaction: SqliteTransactionTimer,
): SqliteDriver {
  const timed = <T>(kind: "read" | "write", run: () => Promise<T>) => {
    const startedAt = performance.now();
    return run().finally(() =>
      onTransaction(kind, performance.now() - startedAt),
    );
  };
  return {
    close: () => driver.close(),
    read: (work) => timed("read", () => driver.read(work)),
    write: (work) => timed("write", () => driver.write(work)),
  };
}
