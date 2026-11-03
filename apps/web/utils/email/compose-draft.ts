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
  // Recording runs alongside the read the save already makes, so it adds no
  // wait. A send may have replaced this session's draft while the save was on
  // its way; the draft it just wrote is then removed instead of left in Drafts.
  const [sessionSent, message] = await Promise.all([
    composeSession
      ? recordSessionDraft(composeSession, draftId)
      : Promise.resolve(false),
    provider.getDraft(draftId).catch(() => null),
  ]);
  if (sessionSent && composeSession) {
    if (!(await discardWithRetry({ draftId, provider })))
      composeSession.logger.warn(
        "Could not remove a draft saved after its send",
      );
    // Tells the composer the session is over, so it stops saving to a draft
    // that no longer exists.
    return {
      draftId,
      messageId: null,
      threadId: null,
      sessionSent: true as const,
    };
  }
  return {
    draftId,
    messageId: message?.id ?? null,
    threadId: message?.threadId ?? null,
  };
}

/**
 * After a send that replaced its compose session's draft is delivered,
 * marks the session sent and removes every draft it saved. A save that lands
 * later sees the mark and removes its own draft. Safe to repeat.
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
  const draftIds = await markComposeSessionSent({ emailAccountId, sessionId });
  const kept: string[] = [];
  for (const draftId of draftIds)
    if (!(await discardWithRetry({ draftId, provider }))) kept.push(draftId);
  if (kept.length)
    throw new Error(`Could not remove ${kept.length} replaced draft(s)`);
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

async function recordSessionDraft(
  composeSession: { id: string; emailAccountId: string; logger: Logger },
  draftId: string,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await recordComposeSessionDraft({
        emailAccountId: composeSession.emailAccountId,
        sessionId: composeSession.id,
        draftId,
      });
    } catch (error) {
      if (attempt === 1)
        composeSession.logger.warn(
          "Could not record the compose session draft",
          {
            error,
          },
        );
    }
  }
  return false;
}

// Provider calls fail now and then; a replaced draft is worth a few tries.
async function discardWithRetry({
  draftId,
  provider,
}: {
  draftId: string;
  provider: EmailProvider;
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await discardComposeDraft({ draftId, provider });
      return true;
    } catch {
      if (attempt < 2)
        await new Promise((resolve) => setTimeout(resolve, 300 * 3 ** attempt));
    }
  }
  return false;
}
