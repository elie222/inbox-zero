import type { OutlookClient } from "./client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("outlook/folders");

// Should not use a common separator like "/|\>" as it may be used in the folder name.
// Using U+2999 as it is unlikely to appear in normal text
export const FOLDER_SEPARATOR = " ⦙ ";
export type OutlookFolder = {
  id: string;
  displayName: string;
  childFolders?: OutlookFolder[];
};

export async function getOutlookRootFolders(
  client: OutlookClient,
): Promise<OutlookFolder[]> {
  const fields = "id,displayName";
  const response = await client
    .getClient()
    .api("/me/mailFolders")
    .select(fields)
    .expand(
      `childFolders($select=${fields};$expand=childFolders($select=${fields}))`,
    )
    .get();

  return response.value;
}

export async function getOutlookChildFolders(
  client: OutlookClient,
  folderId: string,
): Promise<OutlookFolder[]> {
  const fields = "id,displayName";
  const response = await client
    .getClient()
    .api(`/me/mailFolders/${folderId}/childFolders`)
    .select(fields)
    .expand(
      `childFolders($select=${fields};$expand=childFolders($select=${fields}))`,
    )
    .get();

  return response.value;
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
    const folderQueue: OutlookFolder[] = [...folders];

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
        folderQueue.push(...folder.childFolders);
      }
    }
  }

  return folders;
}
