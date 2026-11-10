import type { EmailProvider } from "@/utils/email/types";
import { isGoogleProvider } from "@/utils/email/provider-types";
import type { Logger } from "@/utils/logger";
import type { BulkInboxActionSearch } from "@/utils/bulk-inbox-action/validation";
import {
  normalizeOutlookSearchInput,
  runOutlookSearch,
} from "@/utils/outlook/assistant-search";

export async function searchBulkInboxActionPage({
  emailProvider,
  provider,
  search,
  pageToken,
  pageSize,
  logger,
}: {
  emailProvider: EmailProvider;
  provider: string;
  search: BulkInboxActionSearch;
  pageToken?: string | null;
  pageSize: number;
  logger: Logger;
}) {
  if (isGoogleProvider(provider)) {
    return emailProvider.searchMessages({
      query: search.query,
      maxResults: pageSize,
      pageToken: pageToken ?? undefined,
    });
  }

  const outlookSearch = await runOutlookSearch({
    emailProvider,
    normalizedInput: normalizeOutlookSearchInput({
      query: search.query,
      fromEmail: search.fromEmail,
      readState: search.readState,
      categoryName: search.categoryName,
      folderName: search.folderName,
    }),
    limit: pageSize,
    pageToken,
    logger,
  });

  if (!outlookSearch.result) {
    throw outlookSearch.lastError ?? new Error("Outlook search failed");
  }

  return outlookSearch.result;
}
