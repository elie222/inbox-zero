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
  depth = 5,
): Promise<OutlookFolder[]> {
  const fields = "id,displayName";

  // Microsoft Graph API only allows 2 levels deep with $expand
  const expandQuery = `childFolders($select=${fields};$expand=childFolders($select=${fields}))`;

  const response = await client
    .getClient()
    .api("/me/mailFolders")
    .select(fields)
    .expand(expandQuery)
    .get();

  const folders = response.value;

  if (depth > 2) {
    let currentDepth = 2;
    while (currentDepth < depth) {
      const fetchNestedFolders = async (folderList: OutlookFolder[]) => {
        for (const folder of folderList) {
          if (folder.childFolders && Array.isArray(folder.childFolders)) {
            await fetchNestedFolders(folder.childFolders);
          } else {
            try {
              const childResponse = await client
                .getClient()
                .api(`/me/mailFolders/${folder.id}/childFolders`)
                .select(fields)
                .get();

              folder.childFolders = childResponse.value.map(
                (childFolder: any) => ({
                  id: childFolder.id,
                  displayName: childFolder.displayName,
                  parentFolderId: folder.id,
                }),
              );
            } catch (error) {
              logger.warn("Failed to fetch deeper folders", {
                folderId: folder.id,
                depth: currentDepth,
                error,
              });
            }
          }
        }
      };

      await fetchNestedFolders(folders);
      currentDepth++;
    }
  }

  return folders;
}
