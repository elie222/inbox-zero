import { wipeNodeMailbox } from "@inboxzero/mail-sqlite/node";

export async function closeAndWipeDesktopMailbox(input: {
  owner?: { close(): Promise<void> } | null;
  databasePath: string;
}) {
  try {
    await input.owner?.close();
  } catch {
    // Logout still proceeds if the owner is already gone.
  }
  await wipeNodeMailbox(input.databasePath);
}
