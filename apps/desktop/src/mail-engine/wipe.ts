import { wipeNodeMailbox } from "@inboxzero/mail-sqlite/node";

export async function closeDesktopMailbox(
  owner?: { close(): Promise<void> } | null,
) {
  try {
    await owner?.close();
  } catch {
    // Logout and quit still proceed if the owner is already gone.
  }
}

export async function closeAndWipeDesktopMailbox(input: {
  owner?: { close(): Promise<void> } | null;
  databasePath: string;
}) {
  await closeDesktopMailbox(input.owner);
  await wipeNodeMailbox(input.databasePath);
}
