import type { DriveProvider, DriveFolder } from "@/utils/drive/types";
import type { Logger } from "@/utils/logger";

/**
 * Create a folder path in the drive, creating intermediate folders as needed.
 * Returns the final folder.
 */
export async function createFolderPath(
  provider: DriveProvider,
  path: string,
  logger: Logger,
): Promise<DriveFolder> {
  const parts = path.split("/").filter(Boolean);
  let parentId: string | undefined;
  let currentFolder: DriveFolder | null = null;

  for (const part of parts) {
    const existingFolders = await provider.listFolders(parentId);
    const existing = existingFolders.find(
      (f) => f.name.toLowerCase() === part.toLowerCase(),
    );

    if (existing) {
      currentFolder = existing;
      parentId = existing.id;
    } else {
      logger.info("Creating folder", { name: part, parentId });
      currentFolder = await provider.createFolder(part, parentId);
      parentId = currentFolder.id;
    }
  }

  if (!currentFolder) {
    throw new Error("Failed to create folder path");
  }

  return currentFolder;
}
