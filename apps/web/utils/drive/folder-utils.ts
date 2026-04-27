import type { DriveProvider, DriveFolder } from "@/utils/drive/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

interface FolderPathResult {
  allFolders: { folder: DriveFolder; path: string }[];
  folder: DriveFolder;
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
  const resolvedPathParts: string[] = [];

  for (const part of parts) {
    const normalizedPart = normalizeFolderPathPart(provider, part);
    const existingFolders = await provider.listFolders(parentId);
    const existing = existingFolders.find(
      (f) => f.name.toLowerCase() === normalizedPart.toLowerCase(),
    );

    if (existing) {
      currentFolder = existing;
      parentId = existing.id;
    } else {
      logger.info("Creating folder", { name: normalizedPart, parentId });
      currentFolder = await provider.createFolder(normalizedPart, parentId);
      parentId = currentFolder.id;
    }

    resolvedPathParts.push(currentFolder.name);
    allFolders.push({
      folder: currentFolder,
      path: resolvedPathParts.join("/"),
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

const INVALID_ONEDRIVE_NAME_CHARS = /[\\/:*?"<>|]/g;

function normalizeFolderPathPart(provider: DriveProvider, part: string) {
  if (provider.name !== "microsoft") {
    return part;
  }

  const normalizedPart = part
    .replace(INVALID_ONEDRIVE_NAME_CHARS, "-")
    .trim()
    .replace(/[. ]+$/g, "");

  return normalizedPart || "untitled";
}
