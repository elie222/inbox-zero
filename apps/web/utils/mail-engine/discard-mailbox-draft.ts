import type { MailClient } from "@inboxzero/mail-core/engine";
import { discardComposeDraftAction } from "@/utils/actions/mail";
import { captureException, getActionErrorMessage } from "@/utils/error";
import { admissionRejectionCopy } from "@/utils/mail-engine/admission-notice";
import { randomUuid } from "@/utils/uuid";

/**
 * Hides every mailbox message the draft was saved as straight away. The
 * engine deletes the provider draft in the background and shows the draft
 * again if the provider refuses. Without the engine, or before a save has
 * reported a mailbox message, the provider draft is deleted directly.
 *
 * Throws with a user-facing message when the draft could not be discarded.
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
  let rejection: string | undefined;
  if (client && messageIds.length > 0) {
    try {
      const admission = await client.submitMetadata({
        accountId: emailAccountId,
        commandId: randomUuid(),
        targets: messageIds.map((messageId) => ({
          accountId: emailAccountId,
          messageId,
        })),
        change: { kind: "discard_draft", ...(draftId ? { draftId } : {}) },
      });
      if (admission.status !== "rejected") return;
      rejection = admissionRejectionCopy(admission.code) ?? undefined;
    } catch (error) {
      // The engine may have admitted the discard before failing. Both paths
      // treat a draft the other already deleted as discarded, so deleting
      // directly is still safe.
      captureException(error);
      if (!draftId) throw error;
    }
  }
  if (!draftId) throw new Error(rejection ?? "Failed to discard draft");

  const result = await discardComposeDraftAction(emailAccountId, { draftId });
  if (!result?.data) throw new Error(getActionErrorMessage(result ?? {}));
  // A copy the local mailbox already holds goes once sync sees it deleted.
  await client?.requestSync([emailAccountId]).catch(() => undefined);
}
