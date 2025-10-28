import type { MailFolder } from "@microsoft/microsoft-graph-types";
import type { OutlookClient } from "./client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("outlook/folders");

// Should not use a common separator like "/|\>" as it may be used in the folder name.
// Using U+2999 as it is unlikely to appear in normal text
export const FOLDER_SEPARATOR = " ⦙ ";

export type OutlookFolder = {
  id: NonNullable<MailFolder["id"]>;
  displayName: NonNullable<MailFolder["displayName"]>;
  childFolders: OutlookFolder[];
};

function convertMailFolderToOutlookFolder(folder: MailFolder): OutlookFolder {
  return {
    id: folder.id ?? "",
    displayName: folder.displayName ?? "",
    childFolders:
      folder.childFolders?.map(convertMailFolderToOutlookFolder) ?? [],
  };
}

export async function getOutlookRootFolders(
  client: OutlookClient,
): Promise<OutlookFolder[]> {
  const fields = "id,displayName";
  const response: { value: MailFolder[] } = await client
    .getClient()
    .api("/me/mailFolders")
    .select(fields)
    .top(999)
    .expand(
      `childFolders($select=${fields};$expand=childFolders($select=${fields}))`,
    )
    .get();

  return response.value.map(convertMailFolderToOutlookFolder);
}

export async function getOutlookChildFolders(
  client: OutlookClient,
  folderId: string,
): Promise<OutlookFolder[]> {
  const fields = "id,displayName";
  const response: { value: MailFolder[] } = await client
    .getClient()
    .api(`/me/mailFolders/${folderId}/childFolders`)
    .select(fields)
    .expand(
      `childFolders($select=${fields};$expand=childFolders($select=${fields}))`,
    )
    .get();

  return response.value.map(convertMailFolderToOutlookFolder);
}

async function findOutlookFolderByName(
  client: OutlookClient,
  folderName: string,
): Promise<OutlookFolder | undefined> {
  try {
    const response: { value: MailFolder[] } = await client
      .getClient()
      .api("/me/mailFolders")
      .filter(`displayName eq '${folderName.replace(/'/g, "''")}'`)
      .select("id,displayName")
      .top(1)
      .get();

    if (response.value && response.value.length > 0) {
      return convertMailFolderToOutlookFolder(response.value[0]);
    }
    return undefined;
  } catch (error) {
    logger.warn("Error finding folder by name", { folderName, error });
    return undefined;
  }
}

export async function getOutlookFolderTree(
  client: OutlookClient,
  expandLevels = 6,
): Promise<OutlookFolder[]> {
  const folders = await getOutlookRootFolders(client);

  if (expandLevels <= 2) {
    return folders;
  }

  const remainingLevels = expandLevels - 2;
  for (let currentLevel = 0; currentLevel < remainingLevels; currentLevel++) {
    const folderQueue = [...folders];

    while (folderQueue.length > 0) {
      const folder = folderQueue.shift()!;
      if (!folder.childFolders || folder.childFolders.length === 0) {
        try {
          folder.childFolders = await getOutlookChildFolders(client, folder.id);
        } catch (error) {
          logger.warn("Failed to fetch deeper folders", {
            folderId: folder.id,
            error,
          });
        }
      }
      if (folder.childFolders) {
        folderQueue.push(
          ...folder.childFolders.map(convertMailFolderToOutlookFolder),
        );
      }
    }
  }

  return folders;
}

export async function getOrCreateOutlookFolderIdByName(
  client: OutlookClient,
  folderName: string,
): Promise<string> {
  const existingFolder = await findOutlookFolderByName(client, folderName);

  if (existingFolder) {
    return existingFolder.id;
  }

  try {
    const response = await client.getClient().api("/me/mailFolders").post({
      displayName: folderName,
    });

    return response.id;
  } catch (error) {
    // If folder already exists (race condition or created between check and create),
    // fetch folders again and return the existing folder ID
    // biome-ignore lint/suspicious/noExplicitAny: simplest
    const err = error as any;
    if (err?.code === "ErrorFolderExists" || err?.statusCode === 409) {
      logger.info("Folder already exists, fetching existing folder", {
        folderName,
      });
      const folder = await findOutlookFolderByName(client, folderName);
      if (folder) {
        return folder.id;
      }
    }
    throw error;
  }
}

/**
 * Get or create an InboxZero folder (for tracking processed/archived emails)
 * Similar to Gmail's getOrCreateInboxZeroLabel
 */
export async function getOrCreateInboxZeroFolder(
  client: OutlookClient,
  folderType: "processed" | "archived" | "marked_read",
): Promise<{ id: string; displayName: string }> {
  const folderName = `Inbox Zero/${folderType}`;
  const folderId = await getOrCreateOutlookFolderIdByName(client, folderName);

  return {
    id: folderId,
    displayName: folderName,
  };
}

/**
 * Move a message to a specific folder
 * Used for archiving or organizing emails
 */
export async function moveMessageToFolder(
  client: OutlookClient,
  messageId: string,
  destinationFolderId: string,
): Promise<void> {
  await client.getClient().api(`/me/messages/${messageId}/move`).post({
    destinationId: destinationFolderId,
  });
}

/**
 * Mark a message as read or unread
 */
export async function markMessageAsRead(
  client: OutlookClient,
  messageId: string,
  isRead: boolean,
): Promise<void> {
  await client.getClient().api(`/me/messages/${messageId}`).patch({
    isRead,
  });
}

/**
 * Flag (star) or unflag a message
 * Equivalent to Gmail's starred label
 */
export async function flagMessage(
  client: OutlookClient,
  messageId: string,
  isFlagged: boolean,
): Promise<void> {
  await client
    .getClient()
    .api(`/me/messages/${messageId}`)
    .patch({
      flag: isFlagged
        ? { flagStatus: "flagged" }
        : { flagStatus: "notFlagged" },
    });
}

/**
 * Get well-known folder IDs (inbox, sent, archive, etc.)
 * These are standard folders that exist in all Outlook accounts
 */
export async function getWellKnownFolderId(
  client: OutlookClient,
  folderName:
    | "inbox"
    | "sentitems"
    | "deleteditems"
    | "drafts"
    | "junkemail"
    | "archive",
): Promise<string> {
  const response = await client
    .getClient()
    .api(`/me/mailFolders/${folderName}`)
    .select("id")
    .get();

  return response.id;
}
