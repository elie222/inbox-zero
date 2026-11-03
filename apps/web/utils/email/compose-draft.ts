import { ensureEmailSendingEnabled } from "@/utils/mail";
import { SafeError } from "@/utils/error";
import type { EmailProvider } from "@/utils/email/types";
import type { SendEmailBody } from "@/utils/types/mail";
import type { Logger } from "@/utils/logger";
import {
  markComposeSessionSent,
  recordComposeSessionDraft,
} from "@/utils/redis/compose-session-draft";

export async function saveComposeDraft({
  draftId,
  provider,
  content,
  composeSession,
}: {
  draftId?: string;
  provider: EmailProvider;
  content: SendEmailBody;
  /** Lets a send that replaces this draft find and remove it. */
  composeSession?: { id: string; emailAccountId: string; logger: Logger };
}) {
  if (!draftId) {
    // Return the reference before syncing the rest of the content so later
    // failures can retry an update without creating another mailbox draft.
    const draft = await provider.createDraft({
      to: content.to,
      from: content.from,
      cc: content.cc,
      bcc: content.bcc,
      subject: content.subject,
      messageHtml: content.messageHtml,
      replyToMessageId: content.replyToEmail?.messageId,
      forwardedMessageId: content.replyToEmail?.messageId
        ? undefined
        : content.replyToEmail?.forwardedMessageId,
    });
    if (!draft.id) throw new SafeError("Could not confirm the mailbox draft.");
    draftId = draft.id;
  } else {
    await provider.updateDraft(draftId, composeDraftTextUpdate(content));
  }
  // A send may have replaced this session's draft while the save was on its
  // way; the draft it just wrote is then removed instead of left in Drafts.
  if (
    composeSession &&
    (await recordComposeSessionDraft({
      emailAccountId: composeSession.emailAccountId,
      sessionId: composeSession.id,
      draftId,
    }).catch((error) => {
      composeSession.logger.warn("Could not record the compose session draft", {
        error,
      });
      return false;
    }))
  ) {
    await discardComposeDraft({ draftId, provider });
    return { draftId, messageId: null, threadId: null };
  }
  const message = await provider.getDraft(draftId).catch(() => null);
  return {
    draftId,
    messageId: message?.id ?? null,
    threadId: message?.threadId ?? null,
  };
}

/**
 * After a send that replaced its compose session's draft is delivered,
 * marks the session sent and removes the draft it last saved. A save that
 * lands later sees the mark and removes its own draft.
 */
export async function discardDraftReplacedBySend({
  emailAccountId,
  sessionId,
  provider,
}: {
  emailAccountId: string;
  sessionId: string;
  provider: EmailProvider;
}) {
  const draftId = await markComposeSessionSent({ emailAccountId, sessionId });
  if (draftId) await discardComposeDraft({ draftId, provider });
}

export async function discardComposeDraft({
  draftId,
  provider,
}: {
  draftId: string;
  provider: EmailProvider;
}) {
  const message = await provider.getDraft(draftId);
  if (!message) return;
  const reference = await provider.getDraftReferenceForMessage(message.id);
  if (
    !reference ||
    !(await provider.deleteDraft(reference.id, reference.version))
  )
    throw new SafeError(
      "The mailbox draft changed. Reopen it before discarding.",
    );
}

export async function sendComposeDraft({
  draftId,
  provider,
  email,
}: {
  draftId: string;
  provider: EmailProvider;
  email: SendEmailBody;
}) {
  ensureEmailSendingEnabled();
  await provider.updateDraft(draftId, composeDraftTextUpdate(email));
  return provider.sendDraft(draftId);
}

// Attachments are added to and removed from the mailbox draft as the user
// edits, so saving or sending the text must leave them as they are.
function composeDraftTextUpdate(content: SendEmailBody) {
  return {
    to: content.to,
    from: content.from,
    cc: content.cc ?? "",
    bcc: content.bcc ?? "",
    subject: content.subject,
    messageHtml: content.messageHtml,
  };
}
