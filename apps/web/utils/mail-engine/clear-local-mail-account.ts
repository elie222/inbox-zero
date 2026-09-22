import { clearArchiveSenderStatuses } from "@/store/archive-sender-queue";
import { clearDeleteSenderStatuses } from "@/store/delete-sender-queue";
import { clearMarkReadSenderStatuses } from "@/store/mark-read-sender-queue";
import { clearRecentSearchHistoryForAccount } from "@/store/mail-search-history";
import { getActiveMailClient } from "@/utils/mail-engine/active-client";
import { clearLocalReplyDrafts } from "@/utils/mail-engine/reply-drafts";
import { clearPersistedSwrCacheForAccount } from "@/utils/swr-persistence";

export async function clearLocalMailAccountState(emailAccountId: string) {
  clearLocalReplyDrafts(emailAccountId);
  clearPersistedSwrCacheForAccount(emailAccountId);
  clearRecentSearchHistoryForAccount(emailAccountId);
  clearArchiveSenderStatuses(emailAccountId);
  clearDeleteSenderStatuses(emailAccountId);
  clearMarkReadSenderStatuses(emailAccountId);
  const client = getActiveMailClient();
  if (!client) {
    throw new Error("Mail engine is not ready to remove this mailbox.");
  }
  await client.purgeAccount(emailAccountId);
}
