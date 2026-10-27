import {
  getReplyDraft,
  type ReplyDraftIdentity,
} from "@/utils/mail-engine/reply-drafts";

export async function resolveSendDraftId(
  providerDraftId: string | undefined,
  identity: ReplyDraftIdentity | undefined,
) {
  if (providerDraftId) return providerDraftId;
  const local = identity ? await getReplyDraft(identity) : undefined;
  const draftId = local?.content?.providerDraftId;
  if (!draftId && local?.content?.attachments.length) {
    throw new Error(
      "Could not confirm the mailbox draft holding this email's attachments. Your draft is still saved on this device.",
    );
  }
  // Creating a mailbox draft never sends it. The outbox owns send deduplication;
  // the caller still requires a confirmed provider draft for attachments.
  return draftId;
}
