import type { EmailProvider } from "@/utils/email/types";

export async function readComposeDraft({
  provider,
  draftId,
}: {
  provider: EmailProvider;
  draftId: string;
}) {
  const message = await provider.getDraft(draftId);
  if (!message) return null;

  const attachments = [
    ...(message.attachments ?? []).map((attachment) => ({
      ...attachment,
      inline: false,
    })),
    ...message.inline.map((attachment) => ({ ...attachment, inline: true })),
  ].map((attachment) => ({
    attachmentId: attachment.attachmentId,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    inline: attachment.inline,
    contentId:
      attachment.headers["content-id"]?.trim().replace(/^<|>$/g, "") || null,
  }));

  return {
    draftId,
    messageId: message.id,
    threadId: message.threadId,
    from: message.headers.from,
    to: message.headers.to,
    cc: message.headers.cc ?? "",
    bcc: message.headers.bcc ?? "",
    subject: message.subject,
    html: message.textHtml ?? null,
    text: message.textPlain ?? null,
    attachments,
  };
}

export async function readComposeDraftForMessage({
  provider,
  messageId,
}: {
  provider: EmailProvider;
  messageId: string;
}) {
  const reference = await provider.getDraftReferenceForMessage(messageId);
  if (!reference) return null;
  return readComposeDraft({ provider, draftId: reference.id });
}
