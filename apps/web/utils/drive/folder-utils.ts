import type { DriveProvider, DriveFolder } from "@/utils/drive/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

interface FolderPathResult {
  folder: DriveFolder;
  allFolders: { folder: DriveFolder; path: string }[];
}

/**
 * Create a folder path in the drive, creating intermediate folders as needed.
 * Returns the final folder and all folders along the path.
 */
export async function createFolderPath(
  provider: DriveProvider,
  path: string,
  logger: Logger,
): Promise<FolderPathResult> {
  const parts = path.split("/").filter(Boolean);
  let parentId: string | undefined;
  let currentFolder: DriveFolder | null = null;
  const allFolders: { folder: DriveFolder; path: string }[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
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

    allFolders.push({
      folder: currentFolder,
      path: parts.slice(0, i + 1).join("/"),
    });
  }

  if (!currentFolder) {
    throw new Error("Failed to create folder path");
  }

  return { folder: currentFolder, allFolders };
}

export async function createAndSaveFilingFolder({
  driveProvider,
  folderPath,
  emailAccountId,
  driveConnectionId,
  logger,
}: {
  driveProvider: DriveProvider;
  folderPath: string;
  emailAccountId: string;
  driveConnectionId: string;
  logger: Logger;
}): Promise<DriveFolder> {
  const { folder, allFolders } = await createFolderPath(
    driveProvider,
    folderPath,
    logger,
  );

  // Save all folders along the path so they appear as "allowed" in the UI
  await Promise.all(
    allFolders.map(({ folder: f, path }) =>
      prisma.filingFolder.upsert({
        where: {
          emailAccountId_folderId: { emailAccountId, folderId: f.id },
        },
        update: {},
        create: {
          folderId: f.id,
          folderName: f.name,
          folderPath: path,
          driveConnectionId,
          emailAccountId,
        },
      }),
    ),
  );

  logger.info("Saved filing folders for path", {
    folderPath,
    count: allFolders.length,
  });

  return folder;
}
