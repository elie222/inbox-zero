import type { MailClient } from "@inboxzero/mail-core/engine";
import {
  rememberProviderDraftMessage,
  rememberReplacedDraftMessage,
  type ReplyDraftIdentity,
} from "@/utils/mail-engine/reply-drafts";

/**
 * A provider save can move a draft to a new message (Gmail does on every
 * save), so the views that track the draft follow it. A composer's local draft
 * keeps every message it was saved as, so a send waiting to go out from the
 * mailbox draft can hide whichever copy the mailbox still shows.
 */
export async function followProviderDraftMessage({
  client,
  emailAccountId,
  messageId,
  openedDraftMessageId,
  isNewCompose,
  localDraft,
}: {
  client: MailClient | null;
  emailAccountId: string;
  messageId: string | null;
  /** The mailbox draft this composer was opened from, if any. */
  openedDraftMessageId?: string;
  isNewCompose: boolean;
  localDraft?: { identity: ReplyDraftIdentity; requestId: string };
}) {
  if (!messageId) return;
  if (openedDraftMessageId) {
    if (messageId === openedDraftMessageId) return;
    rememberReplacedDraftMessage(
      emailAccountId,
      openedDraftMessageId,
      messageId,
    );
    await ingestMailboxDraft(client, emailAccountId, messageId);
    return;
  }
  if (isNewCompose) await ingestMailboxDraft(client, emailAccountId, messageId);
  if (!localDraft) return;
  await rememberProviderDraftMessage(
    localDraft.identity,
    localDraft.requestId,
    messageId,
  );
}

async function ingestMailboxDraft(
  client: MailClient | null,
  emailAccountId: string,
  messageId: string,
) {
  if (!client) return;
  await client.ensureMessageContent({
    accountId: emailAccountId,
    messageId,
  });
  await client.requestSync([emailAccountId]);
}
