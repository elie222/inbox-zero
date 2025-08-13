import type { OutlookClient } from "./client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("outlook/folders");

// Should not use a common separator like "/|\>" as it may be used in the folder name.
// Using U+2999 as it is unlikely to appear in normal text
export const FOLDER_SEPARATOR = " ⦙ ";
export type OutlookFolder = {
  id: string;
  displayName: string;
  parentFolderId?: string;
  childFolders?: OutlookFolder[];
};

export async function getOutlookFolders(
  client: OutlookClient,
  expandLevels = 4, // This is fetching 6 levels deep
): Promise<OutlookFolder[]> {
  const getFolders = async (path: string) => {
    const fields = "id,displayName";
    const response = await client
      .getClient()
      .api(path)
      .select(fields)
      .expand(
        `childFolders($select=${fields};$expand=childFolders($select=${fields}))`,
      )
      .get();

    return response.value;
  };

  const folders = await getFolders("/me/mailFolders");
  const processFolders = (
    folderList: OutlookFolder[],
    parentId?: string,
  ): OutlookFolder[] => {
    return folderList.map((folder) => ({
      ...folder,
      parentFolderId: parentId,
      childFolders: folder.childFolders
        ? processFolders(folder.childFolders, folder.id)
        : undefined,
    }));
  };

  const processedFolders = processFolders(folders);
  for (let currentLevel = 0; currentLevel < expandLevels; currentLevel++) {
    const fetchNested = async (folderList: OutlookFolder[]) => {
      for (const folder of folderList) {
        if (!folder.childFolders || folder.childFolders.length === 0) {
          try {
            const childFolders = await getFolders(
              `/me/mailFolders/${folder.id}/childFolders`,
            );
            folder.childFolders = childFolders.map(
              (childFolder: OutlookFolder) => ({
                id: childFolder.id,
                displayName: childFolder.displayName,
                parentFolderId: folder.id,
              }),
            );
          } catch (error) {
            logger.warn("Failed to fetch deeper folders", {
              folderId: folder.id,
              error,
            });
          }
        } else {
          await fetchNested(folder.childFolders);
        }
      }
    };

    await fetchNested(processedFolders);
  }

  return processedFolders;
}
