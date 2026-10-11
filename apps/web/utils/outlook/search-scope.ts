import type { EmailProvider } from "@/utils/email/types";
import {
  FOLDER_SEPARATOR,
  flattenOutlookFolders,
} from "@/utils/outlook/folders";

export async function resolveOutlookFolderId({
  emailProvider,
  folderName,
}: {
  emailProvider: Pick<EmailProvider, "getFolders">;
  folderName?: string | null;
}): Promise<string | undefined> {
  if (!folderName) return;

  const folders = flattenOutlookFolders(await emailProvider.getFolders()).map(
    (folder) => ({
      id: folder.id,
      name: folder.displayName,
      path: folder.path,
    }),
  );
  const folderById = folders.find((folder) => folder.id === folderName.trim());
  if (folderById) return folderById.id;

  const match = findFolderMatch(folders, folderName);
  if (match.ambiguous) {
    throw new Error(
      "Outlook folder name is ambiguous. Use a folder path or ID from listFolders.",
    );
  }
  if (match.folder) return match.folder.id;

  throw new Error("Outlook folder not found. Use a folder from listFolders.");
}

export async function resolveOutlookCategoryName({
  emailProvider,
  categoryName,
}: {
  emailProvider: Pick<EmailProvider, "getLabels">;
  categoryName?: string;
}): Promise<string | undefined> {
  if (!categoryName) return;

  const categories = await emailProvider.getLabels();
  const trimmedName = categoryName.trim();
  const category =
    categories.find((category) => category.id === trimmedName) ??
    categories.find(
      (category) => category.name.toLowerCase() === trimmedName.toLowerCase(),
    );
  if (category) return category.name;

  throw new Error(
    "Outlook category not found. Use a category from listCategories.",
  );
}

export function findFolderMatch<T extends { name: string; path: string }>(
  folders: T[],
  nameOrPath: string,
) {
  const normalizedInput = normalizeFolderText(nameOrPath);
  const pathMatches = folders.filter(
    (folder) => normalizeFolderText(folder.path) === normalizedInput,
  );

  if (pathMatches.length > 1) return { ambiguous: true };
  if (pathMatches[0]) return { folder: pathMatches[0] };

  const nameMatches = folders.filter(
    (folder) => normalizeFolderText(folder.name) === normalizedInput,
  );

  if (nameMatches.length > 1) return { ambiguous: true };
  if (nameMatches[0]) return { folder: nameMatches[0] };

  const pathAliasMatches = folders.filter(
    (folder) =>
      normalizeFolderPath(folder.path) === normalizeFolderPath(nameOrPath),
  );

  if (pathAliasMatches.length > 1) return { ambiguous: true };
  return { folder: pathAliasMatches[0] };
}

function normalizeFolderPath(path: string) {
  return path
    .split(FOLDER_SEPARATOR)
    .flatMap((segment) => segment.split(/[\\/]/))
    .map(normalizeFolderText)
    .join(FOLDER_SEPARATOR);
}

function normalizeFolderText(value: string) {
  return value.trim().toLowerCase();
}
