import type { DraftContent } from "@inboxzero/mail-core/drafts";
import { splitRecipientList } from "@/utils/email";
import type { SendEmailBody } from "@/utils/types/mail";

export function sendEmailToDraftContent(
  email: SendEmailBody,
  attachmentIds: string[],
): DraftContent {
  return {
    to: splitRecipientList(email.to).slice(0, 100),
    cc: splitRecipientList(email.cc ?? "").slice(0, 100),
    bcc: splitRecipientList(email.bcc ?? "").slice(0, 100),
    subject: email.subject,
    editableHtml: email.messageHtml,
    quotedHtml: "",
    attachmentIds: attachmentIds.slice(0, 20),
  };
}
