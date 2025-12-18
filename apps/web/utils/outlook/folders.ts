import type { MailFolder } from "@microsoft/microsoft-graph-types";
import type { OutlookClient } from "./client";
import type { Logger } from "@/utils/logger";
import { withOutlookRetry } from "@/utils/outlook/retry";

// Should not use a common separator like "/|\>" as it may be used in the folder name.
// Using U+2999 as it is unlikely to appear in normal text
export const FOLDER_SEPARATOR = " ⦙ ";

export type OutlookFolder = {
  id: NonNullable<MailFolder["id"]>;
  displayName: NonNullable<MailFolder["displayName"]>;
  childFolders: OutlookFolder[];
  childFolderCount?: number;
};

function convertMailFolderToOutlookFolder(folder: MailFolder): OutlookFolder {
  return {
    id: folder.id ?? "",
    displayName: folder.displayName ?? "",
    childFolders:
      folder.childFolders?.map(convertMailFolderToOutlookFolder) ?? [],
    childFolderCount: folder.childFolderCount ?? 0,
  };
}

export async function getOutlookRootFolders(
  client: OutlookClient,
  logger: Logger,
): Promise<OutlookFolder[]> {
  const fields = "id,displayName,childFolderCount";
  const response: { value: MailFolder[] } = await withOutlookRetry(
    () =>
      client
        .getClient()
        .api("/me/mailFolders")
        .select(fields)
        .top(999)
        .expand(
          `childFolders($select=${fields};$top=999;$expand=childFolders($select=${fields};$top=999))`,
        )
        .get(),
    logger,
  );

  return response.value.map(convertMailFolderToOutlookFolder);
}

export async function getOutlookChildFolders(
  client: OutlookClient,
  folderId: string,
  logger: Logger,
): Promise<OutlookFolder[]> {
  const fields = "id,displayName,childFolderCount";
  const response: { value: MailFolder[] } = await withOutlookRetry(
    () =>
      client
        .getClient()
        .api(`/me/mailFolders/${folderId}/childFolders`)
        .select(fields)
        .top(999)
        .expand(
          `childFolders($select=${fields};$top=999;$expand=childFolders($select=${fields};$top=999))`,
        )
        .get(),
    logger,
  );

  return response.value.map(convertMailFolderToOutlookFolder);
}

async function findOutlookFolderByName(
  client: OutlookClient,
  folderName: string,
  logger: Logger,
): Promise<OutlookFolder | undefined> {
  try {
    const response: { value: MailFolder[] } = await withOutlookRetry(
      () =>
        client
          .getClient()
          .api("/me/mailFolders")
          .filter(`displayName eq '${folderName.replace(/'/g, "''")}'`)
          .select("id,displayName")
          .top(1)
          .get(),
      logger,
    );

    if (response.value && response.value.length > 0) {
      return convertMailFolderToOutlookFolder(response.value[0]);
    }
    return undefined;
  } catch (error) {
    logger.warn("Error finding folder by name", { folderName, error });
    return undefined;
  }
}

async function expandFolderChildren(
  client: OutlookClient,
  folder: OutlookFolder,
  currentDepth: number,
  maxDepth: number,
  logger: Logger,
): Promise<void> {
  if (currentDepth >= maxDepth) {
    return;
  }

  // Use childFolderCount to know if folder has children that need fetching
  const hasUnfetchedChildren =
    (folder.childFolderCount ?? 0) > 0 &&
    (!folder.childFolders || folder.childFolders.length === 0);

  if (hasUnfetchedChildren) {
    try {
      folder.childFolders = await getOutlookChildFolders(
        client,
        folder.id,
        logger,
      );
    } catch (error) {
      logger.warn("Failed to fetch folder children", {
        folderId: folder.id,
        folderName: folder.displayName,
        error,
      });
      return;
    }
  }

  // Recursively expand children
  for (const child of folder.childFolders || []) {
    await expandFolderChildren(
      client,
      child,
      currentDepth + 1,
      maxDepth,
      logger,
    );
  }
}

export async function getOutlookFolderTree(
  client: OutlookClient,
  maxDepth: number | undefined,
  logger: Logger,
): Promise<OutlookFolder[]> {
  const folders = await getOutlookRootFolders(client, logger);

  // Recursively expand folders that have children
  // Process in parallel batches for better performance
  const expandPromises: Promise<void>[] = [];

  for (const folder of folders) {
    // Expand root folder itself if it has unfetched children
    expandPromises.push(
      expandFolderChildren(client, folder, 1, maxDepth ?? 6, logger),
    );
  }

  await Promise.all(expandPromises);

  return folders;
}

export async function getOrCreateOutlookFolderIdByName(
  client: OutlookClient,
  folderName: string,
  logger: Logger,
): Promise<string> {
  const existingFolder = await findOutlookFolderByName(
    client,
    folderName,
    logger,
  );

  if (existingFolder) {
    return existingFolder.id;
  }

  try {
    const response = await withOutlookRetry(
      () =>
        client.getClient().api("/me/mailFolders").post({
          displayName: folderName,
        }),
      logger,
    );

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
      const folder = await findOutlookFolderByName(client, folderName, logger);
      if (folder) {
        return folder.id;
      }
    }
    throw error;
  }
}
