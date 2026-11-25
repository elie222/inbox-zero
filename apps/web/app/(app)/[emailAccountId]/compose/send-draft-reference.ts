import {
  getReplyDraft,
  type ReplyDraftIdentity,
} from "@/utils/mail-engine/reply-drafts";

export async function resolveSendDraftId(
  providerDraftId: string | undefined,
  identity: ReplyDraftIdentity | undefined,
) {
  if (providerDraftId) return { draftId: providerDraftId };
  const local = identity ? await getReplyDraft(identity) : undefined;
  const draftId = local?.content?.providerDraftId;
  return {
    draftId,
    // A create whose response was lost may have left a draft in the mailbox.
    // The send carries its own content and removes that draft once delivered.
    replacesUnconfirmedDraft:
      !draftId && Boolean(local?.content?.providerDraftCreationUnconfirmed),
  };
}
