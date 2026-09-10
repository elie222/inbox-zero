import type { EmailProvider } from "@/utils/email/types";
import { flattenOutlookFolders } from "@/utils/outlook/folders";

export async function resolveOutlookSearchScope({
  emailProvider,
  scope,
}: {
  emailProvider: Pick<EmailProvider, "getFolders" | "getLabels">;
  scope?: string;
}): Promise<{ folderId?: string; categoryNames: string[] }> {
  if (!scope) return { categoryNames: [] };

  const trimmedScope = scope.trim();
  const [folderTree, categories] = await Promise.all([
    emailProvider.getFolders(),
    emailProvider.getLabels(),
  ]);
  const folders = flattenOutlookFolders(folderTree);

  const folderById = folders.find((folder) => folder.id === trimmedScope);
  if (folderById) return { folderId: folderById.id, categoryNames: [] };

  const categoryById = categories.find(
    (category) => category.id === trimmedScope,
  );
  if (categoryById) return { categoryNames: [categoryById.name] };

  const normalizedScope = trimmedScope.toLowerCase();
  const matchingFolders = folders.filter(
    (folder) =>
      folder.displayName.toLowerCase() === normalizedScope ||
      folder.path.toLowerCase() === normalizedScope,
  );
  const matchingCategories = categories.filter(
    (category) => category.name.toLowerCase() === normalizedScope,
  );

  if (matchingFolders.length + matchingCategories.length > 1) {
    throw new Error(
      "Outlook search scope is ambiguous. Use a folder path or ID from listFolders, or a category ID.",
    );
  }

  const [folder] = matchingFolders;
  if (folder) return { folderId: folder.id, categoryNames: [] };

  const [category] = matchingCategories;
  if (category) return { categoryNames: [category.name] };

  throw new Error(
    "Outlook folder or category not found. List available folders and categories before retrying.",
  );
}
