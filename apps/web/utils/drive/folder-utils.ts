import type { DriveProvider, DriveFolder } from "@/utils/drive/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

interface FolderPathResult {
  allFolders: { folder: DriveFolder; path: string }[];
  folder: DriveFolder;
}

/**
 * An existing folder the AI or the user is allowed to file into. `path` is the
 * display path the folder was saved with (for example "Finance/Receipts").
 */
export interface KnownFolder {
  driveConnectionId: string;
  id: string;
  name: string;
  path: string;
}

/**
 * A folder to start a new path from. The new folder's saved path is
 * `${path}/${relativePath}` so nested folders keep their full display path.
 */
export interface FolderPathParent {
  id: string;
  path: string;
}

type FolderPathTarget<T extends KnownFolder> =
  | { kind: "existing"; folder: T }
  | {
      kind: "create";
      parent: T | null;
      relativePath: string;
      fullPath: string;
    };

/**
 * Create a folder path in the drive, creating intermediate folders as needed.
 * Returns the final folder and all folders along the path.
 *
 * When `parent` is given the path is created inside that folder instead of the
 * drive root, and every returned path is prefixed with the parent's path.
 */
export async function createFolderPath(
  provider: DriveProvider,
  path: string,
  logger: Logger,
  parent?: FolderPathParent | null,
): Promise<FolderPathResult> {
  const parts = splitFolderPath(path);
  let parentId: string | undefined = parent?.id;
  let currentFolder: DriveFolder | null = null;
  const allFolders: { folder: DriveFolder; path: string }[] = [];
  const resolvedPathParts: string[] = parent
    ? splitFolderPath(parent.path)
    : [];

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
  parent,
  emailAccountId,
  driveConnectionId,
  logger,
}: {
  driveProvider: DriveProvider;
  folderPath: string;
  parent?: FolderPathParent | null;
  emailAccountId: string;
  driveConnectionId: string;
  logger: Logger;
}): Promise<DriveFolder> {
  const { folder, allFolders } = await createFolderPath(
    driveProvider,
    folderPath,
    logger,
    parent,
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
    parentPath: parent?.path,
    count: allFolders.length,
  });

  return folder;
}

/**
 * Resolve a requested folder path against the folders that are already known
 * (user-selected allowed folders and folders created by earlier filings).
 *
 * - An exact path match reuses that folder.
 * - Otherwise the longest known folder whose path is a prefix of the request
 *   becomes the parent, so "Receipts/2026/Amazon" nests inside a known
 *   "Receipts" folder wherever that folder lives in the drive.
 * - With no matching prefix the path is created from the drive root.
 *
 * Known folders can live on different drive connections; the caller uses the
 * resolved folder's connection.
 */
export function resolveFolderPathTarget<T extends KnownFolder>({
  folderPath,
  folders,
}: {
  folderPath: string;
  folders: T[];
}): FolderPathTarget<T> {
  const requestedParts = splitFolderPath(folderPath);
  const requestedKey = requestedParts.map(normalizeFolderKey);

  let bestParent: { folder: T; depth: number } | null = null;

  for (const folder of folders) {
    const folderKey = splitFolderPath(folder.path).map(normalizeFolderKey);
    if (folderKey.length === 0 || folderKey.length > requestedKey.length) {
      continue;
    }

    const isPrefix = folderKey.every(
      (part, index) => part === requestedKey[index],
    );
    if (!isPrefix) continue;

    if (folderKey.length === requestedKey.length) {
      return { kind: "existing", folder };
    }

    if (!bestParent || folderKey.length > bestParent.depth) {
      bestParent = { folder, depth: folderKey.length };
    }
  }

  if (bestParent) {
    return {
      kind: "create",
      parent: bestParent.folder,
      relativePath: requestedParts.slice(bestParent.depth).join("/"),
      fullPath: [
        ...splitFolderPath(bestParent.folder.path),
        ...requestedParts.slice(bestParent.depth),
      ].join("/"),
    };
  }

  return {
    kind: "create",
    parent: null,
    relativePath: requestedParts.join("/"),
    fullPath: requestedParts.join("/"),
  };
}

/**
 * Join a parent path and a relative path into one display path.
 */
export function joinFolderPath(parentPath: string, relativePath: string) {
  return [
    ...splitFolderPath(parentPath),
    ...splitFolderPath(relativePath),
  ].join("/");
}

function splitFolderPath(path: string) {
  return path
    .split(/[\\/]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeFolderKey(part: string) {
  return part.toLowerCase();
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
