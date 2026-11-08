import type { MailClient } from "@inboxzero/mail-core/engine";
import { randomUuid } from "@/utils/uuid";

/**
 * Hides every mailbox message the draft was saved as straight away. The
 * engine deletes the provider draft in the background and shows the draft
 * again if the provider refuses.
 */
export async function discardMailboxDraft({
  client,
  emailAccountId,
  messageIds,
  draftId,
}: {
  client: MailClient | null;
  emailAccountId: string;
  messageIds: string[];
  /** The provider draft, when known; it outlives message ids across saves. */
  draftId?: string;
}) {
  if (!client || messageIds.length === 0) return false;
  const admission = await client.submitMetadata({
    accountId: emailAccountId,
    commandId: randomUuid(),
    targets: messageIds.map((messageId) => ({
      accountId: emailAccountId,
      messageId,
    })),
    change: { kind: "discard_draft", ...(draftId ? { draftId } : {}) },
  });
  return admission.status !== "rejected";
}
