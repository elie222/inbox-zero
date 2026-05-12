import { type InferUITool, tool } from "ai";
import { z } from "zod";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";
import { FOLDER_SEPARATOR, type OutlookFolder } from "@/utils/outlook/folders";
import { posthogCaptureEvent } from "@/utils/posthog";

type FolderToolOptions = {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
};

const threadIdsSchema = z
  .array(z.string())
  .min(1)
  .max(100)
  .transform((ids) => [...new Set(ids)]);

const folderNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe(
    "Exact Outlook mail folder name, or a folder path from listFolders.",
  );

export const listFoldersTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: FolderToolOptions) =>
  tool({
    description:
      "List Outlook mail folders for this account. Use this before moving threads to a folder when the exact folder name is unclear. Returns folder names and paths only; internal folder IDs are not shown.",
    inputSchema: z.object({}),
    execute: async () => {
      trackToolCall({ tool: "list_folders", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });
        const folders = await emailProvider.getFolders();
        const flattenedFolders = flattenFolders(folders).map(toVisibleFolder);

        return {
          folders: flattenedFolders,
          count: flattenedFolders.length,
        };
      } catch (error) {
        logger.error("Failed to list folders", { error });
        return {
          error: "Failed to list folders",
        };
      }
    },
  });

export const createOrGetFolderTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: FolderToolOptions) =>
  tool({
    description:
      "Reuse an existing Outlook mail folder by exact name or create a root mail folder if it does not exist yet. Use this when the user asks to create a folder or before using a new folder in automation.",
    inputSchema: z.object({
      name: folderNameSchema,
    }),
    execute: async ({ name }) => {
      trackToolCall({ tool: "create_or_get_folder", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });
        const folderMatch = findFolderMatch(
          flattenFolders(await emailProvider.getFolders()),
          name,
        );

        if (folderMatch.ambiguous) {
          return {
            error:
              "Multiple folders match that name. Use the folder path from listFolders.",
          };
        }

        if (folderMatch.folder) {
          return {
            created: false,
            folder: toVisibleFolder(folderMatch.folder),
          };
        }

        if (isFolderPath(name)) {
          return {
            error:
              "Folder path not found. Use an existing path from listFolders.",
          };
        }

        await emailProvider.getOrCreateFolderIdByName(name);

        return {
          created: true,
          folder: {
            name,
            path: name,
            childFolderCount: 0,
          },
        };
      } catch (error) {
        logger.error("Failed to create or get folder", { error });
        return {
          error: "Failed to create or get folder",
        };
      }
    },
  });

export const moveThreadsToFolderTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: FolderToolOptions) =>
  tool({
    description:
      "Move existing Outlook threads to an Outlook mail folder. Use threadIds returned by searchInbox. Use listFolders first when the exact folder name or path is unclear. This reuses an existing folder by exact path/name, or creates a root folder when no existing folder matches the name.",
    inputSchema: z.object({
      threadIds: threadIdsSchema.describe(
        "Thread IDs from searchInbox results or thread IDs the user already provided.",
      ),
      folderName: folderNameSchema,
    }),
    execute: async ({ threadIds, folderName }) => {
      trackToolCall({ tool: "move_threads_to_folder", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });
        const uniqueThreadIds = [...new Set(threadIds)];
        const folderMatch = findFolderMatch(
          flattenFolders(await emailProvider.getFolders()),
          folderName,
        );

        if (folderMatch.ambiguous) {
          return {
            error:
              "Multiple folders match that name. Use the folder path from listFolders.",
          };
        }

        if (!folderMatch.folder && isFolderPath(folderName)) {
          return {
            error:
              "Folder path not found. Use an existing path from listFolders.",
          };
        }

        const folderId =
          folderMatch.folder?.id ??
          (await emailProvider.getOrCreateFolderIdByName(folderName));
        const results = await Promise.allSettled(
          uniqueThreadIds.map((threadId) =>
            emailProvider.moveThreadToFolder(threadId, email, folderId),
          ),
        );
        const failedThreadIds = results
          .map((result, index) =>
            result.status === "rejected" ? uniqueThreadIds[index] : null,
          )
          .filter((threadId): threadId is string => Boolean(threadId));

        return {
          success: failedThreadIds.length === 0,
          folderName,
          requestedCount: uniqueThreadIds.length,
          successCount: uniqueThreadIds.length - failedThreadIds.length,
          failedCount: failedThreadIds.length,
          failedThreadIds,
        };
      } catch (error) {
        logger.error("Failed to move threads to folder", { error });
        return {
          error: "Failed to move threads to folder",
        };
      }
    },
  });

export type ListFoldersTool = InferUITool<ReturnType<typeof listFoldersTool>>;
export type CreateOrGetFolderTool = InferUITool<
  ReturnType<typeof createOrGetFolderTool>
>;
export type MoveThreadsToFolderTool = InferUITool<
  ReturnType<typeof moveThreadsToFolderTool>
>;

type FlattenedFolder = {
  name: string;
  path: string;
  childFolderCount: number;
};

type FolderReference = FlattenedFolder & {
  id: string;
};

function flattenFolders(
  folders: OutlookFolder[],
  parentPath?: string,
): FolderReference[] {
  return folders.flatMap((folder) => {
    const path = parentPath
      ? `${parentPath}${FOLDER_SEPARATOR}${folder.displayName}`
      : folder.displayName;
    return [
      {
        id: folder.id,
        name: folder.displayName,
        path,
        childFolderCount: folder.childFolderCount ?? folder.childFolders.length,
      },
      ...flattenFolders(folder.childFolders, path),
    ];
  });
}

function toVisibleFolder(folder: FolderReference): FlattenedFolder {
  return {
    name: folder.name,
    path: folder.path,
    childFolderCount: folder.childFolderCount,
  };
}

function findFolderMatch(folders: FolderReference[], nameOrPath: string) {
  const normalizedInput = normalizeFolderText(nameOrPath);
  const pathMatch = folders.find(
    (folder) => normalizeFolderText(folder.path) === normalizedInput,
  );

  if (pathMatch) return { folder: pathMatch };

  const nameMatches = folders.filter(
    (folder) => normalizeFolderText(folder.name) === normalizedInput,
  );

  if (nameMatches.length > 1) return { ambiguous: true };
  if (nameMatches[0]) return { folder: nameMatches[0] };

  const slashPathMatches = folders.filter(
    (folder) =>
      normalizeFolderText(toSlashSeparatedPath(folder.path)) ===
      normalizedInput,
  );

  if (slashPathMatches.length > 1) return { ambiguous: true };
  return { folder: slashPathMatches[0] };
}

function isFolderPath(nameOrPath: string) {
  return nameOrPath.includes(FOLDER_SEPARATOR);
}

function toSlashSeparatedPath(path: string) {
  return path.split(FOLDER_SEPARATOR).join(" / ");
}

function normalizeFolderText(value: string) {
  return value.trim().toLowerCase();
}

async function trackToolCall({
  tool,
  email,
  logger,
}: {
  tool: string;
  email: string;
  logger: Logger;
}) {
  logger.trace("Tracking tool call", { tool, email });
  return posthogCaptureEvent(email, "AI Assistant Chat Tool Call", { tool });
}
