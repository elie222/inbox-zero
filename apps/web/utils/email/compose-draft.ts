import { ensureEmailSendingEnabled } from "@/utils/mail";
import { SafeError } from "@/utils/error";
import type { EmailProvider } from "@/utils/email/types";
import type { SendEmailBody } from "@/utils/types/mail";

export async function saveComposeDraft({
  draftId,
  provider,
  content,
}: {
  draftId?: string;
  provider: EmailProvider;
  content: SendEmailBody;
}) {
  if (!draftId) {
    // Return the reference before uploading attachments so later failures can
    // retry an update without creating another mailbox draft.
    const draft = await provider.createDraft({
      to: "",
      subject: content.subject,
      messageHtml: content.messageHtml,
    });
    if (!draft.id) throw new SafeError("Could not confirm the mailbox draft.");
    draftId = draft.id;
  } else {
    await provider.updateDraft(draftId, {
      to: content.to,
      cc: content.cc ?? "",
      bcc: content.bcc ?? "",
      subject: content.subject,
      messageHtml: content.messageHtml,
      attachments: content.attachments,
    });
  }
  const message = await provider.getDraft(draftId).catch(() => null);
  return {
    draftId,
    messageId: message?.id ?? null,
    threadId: message?.threadId ?? null,
  };
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
  await provider.updateDraft(draftId, {
    to: email.to,
    cc: email.cc ?? "",
    bcc: email.bcc ?? "",
    subject: email.subject,
    messageHtml: email.messageHtml,
    attachments: email.attachments ?? [],
  });
  return provider.sendDraft(draftId);
}
