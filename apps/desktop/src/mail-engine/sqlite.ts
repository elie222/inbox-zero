import { openOrQuarantineNodeMailbox } from "@inboxzero/mail-sqlite/node";
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";
import type { MailStore } from "@inboxzero/mail-core/ports/mail-store";

export async function createDesktopMailStore(path: string): Promise<MailStore> {
  const { driver } = await openOrQuarantineNodeMailbox(path);
  return createSqliteMailStore(driver);
}
