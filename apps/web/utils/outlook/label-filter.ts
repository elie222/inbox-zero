import type { OutlookClient } from "@/utils/outlook/client";
import { escapeODataString } from "@/utils/outlook/odata-escape";
import type { Logger } from "@/utils/logger";

export const OUTLOOK_WELL_KNOWN_FOLDERS = [
  "inbox",
  "sentitems",
  "drafts",
  "archive",
  "deleteditems",
  "junkemail",
] as const;

export type OutlookWellKnownFolder =
  (typeof OUTLOOK_WELL_KNOWN_FOLDERS)[number];

/**
 * Determines if a labelId is an Outlook well-known folder name.
 * Well-known folders are: inbox, sentitems, drafts, archive, deleteditems, junkemail
 */
export function isWellKnownFolder(labelId: string): boolean {
  return OUTLOOK_WELL_KNOWN_FOLDERS.includes(
    labelId.toLowerCase() as OutlookWellKnownFolder,
  );
}

/**
 * Determines if a labelId looks like an Outlook folder GUID.
 * Outlook folder GUIDs start with "AAM" (base64-encoded format from MS Graph).
 */
export function isFolderGuid(labelId: string): boolean {
  return labelId.startsWith("AAM");
}

/**
 * Determines if a labelId should be treated as a folder (vs a category).
 * Returns true for well-known folder names and folder GUIDs.
 */
export function isOutlookFolder(labelId: string): boolean {
  return isWellKnownFolder(labelId) || isFolderGuid(labelId);
}

/**
 * Looks up the category display name from its ID.
 * Returns null if not found.
 */
export async function getCategoryNameById(
  client: OutlookClient,
  categoryId: string,
  logger: Logger,
): Promise<string | null> {
  try {
    const response: { value: Array<{ id?: string; displayName?: string }> } =
      await client.getClient().api("/me/outlook/masterCategories").get();

    const category = response.value.find((cat) => cat.id === categoryId);
    return category?.displayName ?? null;
  } catch (error) {
    logger.warn("Failed to look up category by ID", { categoryId, error });
    return null;
  }
}

export type LabelFilterResult =
  | { type: "folder"; filter: string }
  | { type: "category"; filter: string }
  | { type: "error"; reason: string };

/**
 * Builds an OData filter for the given labelId.
 *
 * For Outlook:
 * - Well-known folders (inbox, sentitems, etc.) → parentFolderId eq '...'
 * - Folder GUIDs (starting with AAM) → parentFolderId eq '...'
 * - Category IDs (UUIDs) → categories/any(c:c eq '...')
 * - Category names (strings with spaces/punctuation) → categories/any(c:c eq '...')
 *
 * The key difference from Gmail: Outlook uses categories (not folders) for user labels,
 * and the categories filter uses the display name, not the ID.
 */
export async function buildLabelFilter(
  client: OutlookClient,
  labelId: string,
  logger: Logger,
): Promise<LabelFilterResult> {
  if (isWellKnownFolder(labelId)) {
    return {
      type: "folder",
      filter: `parentFolderId eq '${labelId.toLowerCase()}'`,
    };
  }

  if (isFolderGuid(labelId)) {
    return {
      type: "folder",
      filter: `parentFolderId eq '${escapeODataString(labelId)}'`,
    };
  }

  // It's a category - could be an ID (UUID) or a name
  // Try to look it up as an ID first
  const categoryName = await getCategoryNameById(client, labelId, logger);

  if (categoryName) {
    // labelId was a category ID, use the display name for filtering
    const escapedName = escapeODataString(categoryName);
    return {
      type: "category",
      filter: `categories/any(c:c eq '${escapedName}')`,
    };
  }

  // labelId might be a category name directly (e.g., "Awaiting reply")
  // Use it as-is for filtering
  const escapedLabelId = escapeODataString(labelId);
  return {
    type: "category",
    filter: `categories/any(c:c eq '${escapedLabelId}')`,
  };
}
