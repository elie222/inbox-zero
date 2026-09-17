import {
  getReplyDraft,
  type ReplyDraftIdentity,
} from "@/utils/email-cache/reply-drafts";

export async function resolveSendDraftId(
  providerDraftId: string | undefined,
  identity: ReplyDraftIdentity | undefined,
) {
  if (providerDraftId) return providerDraftId;
  const local = identity ? await getReplyDraft(identity) : undefined;
  const draftId = local?.content?.providerDraftId;
  if (!draftId && local?.content?.providerDraftCreationUnconfirmed)
    throw new Error(
      "Mailbox draft creation could not be confirmed. Check Drafts in Gmail or Outlook before sending.",
    );
  return draftId;
}
