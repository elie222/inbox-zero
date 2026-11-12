import type { EmailProvider } from "@/utils/email/types";
import { isGoogleProvider } from "@/utils/email/provider-types";
import type { BulkInboxActionSearch } from "@/utils/bulk-inbox-action/validation";
import { normalizeOutlookSearchInput } from "@/utils/outlook/assistant-search";
import { resolveOutlookFolderId } from "@/utils/outlook/search-scope";

export async function searchBulkInboxActionPage({
  emailProvider,
  provider,
  search,
  pageToken,
  pageSize,
}: {
  emailProvider: EmailProvider;
  provider: string;
  search: BulkInboxActionSearch;
  pageToken?: string | null;
  pageSize: number;
}) {
  if (isGoogleProvider(provider)) {
    return emailProvider.searchMessages({
      query: search.query,
      maxResults: pageSize,
      pageToken: pageToken ?? undefined,
    });
  }

  // Run exactly the confirmed search. searchInbox's Outlook fallbacks can
  // drop field filters, which would widen a write the user already approved.
  const normalized = normalizeOutlookSearchInput({
    query: search.query,
    fromEmail: search.fromEmail,
    readState: search.readState,
    categoryName: search.categoryName,
    folderName: search.folderName,
  });
  const folderId = await resolveOutlookFolderId({
    emailProvider,
    folderName: normalized.folderName,
  });

  return emailProvider.searchMessages({
    query: normalized.query,
    maxResults: pageSize,
    pageToken: pageToken ?? undefined,
    fromEmail: normalized.fromEmail ?? undefined,
    readState: normalized.readState ?? undefined,
    labelName: normalized.categoryName ?? undefined,
    ...(folderId && { folderId }),
  });
}
